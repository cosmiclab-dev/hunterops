import { HttpError, ok, route } from '@/lib/http';
import { extractText } from '@/lib/extract';
import { chatJson, llmConfig } from '@/lib/llm/client';
import { parseResumeMessages } from '@/lib/prompts';
import { loadProfile, normalizeProfile, profileIsEmpty, saveProfile } from '@/lib/profile';
import { regrill } from '@/lib/regrill';
import { heuristicProfile } from '@/lib/resume-heuristic';
import { loadSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
// AI writing with thinking models: a draft plus one Anti-Slop rewrite can take minutes.
export const maxDuration = 300;

// Upload a PDF/DOCX/TXT resume (multipart "file") or send { text }. The model
// structures it; the app shows the draft for review before saving the profile.
// With save=1 (first-run setup) it is saved at once and every job is re-grilled.
// If the AI step fails, a plain reading of the CV is used instead.
export const POST = route(async (req: Request) => {
  let text = '';
  let save = new URL(req.url).searchParams.get('save') === '1';
  const type = req.headers.get('content-type') || '';
  if (type.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    const pasted = form.get('text');
    if (form.get('save') === '1') save = true;
    if (typeof pasted === 'string' && pasted.trim()) text = pasted;
    else if (file && typeof file !== 'string') {
      if (file.size > 4 * 1024 * 1024) throw new HttpError(413, 'Resume files must be under 4 MB.');
      text = await extractText(file.name, Buffer.from(await file.arrayBuffer()));
    }
  } else {
    const body = await req.json().catch(() => ({}));
    text = typeof body.text === 'string' ? body.text : '';
  }
  if (!text || text.trim().length < 80) {
    throw new HttpError(422, 'Could not read enough text. If it is a scanned PDF, export it as a text PDF or DOCX, or paste the text.');
  }
  let draft;
  let model: string | null = null;
  let warning: string | null = null;
  try {
    const cfg = llmConfig(await loadSettings());
    const out = await chatJson(cfg, parseResumeMessages(text.slice(0, 40000)), { maxTokens: 6000, temperature: 0, timeoutMs: 100_000 });
    draft = normalizeProfile(out.data);
    model = out.model;
  } catch (err) {
    warning = `The AI could not read the CV (${(err as Error).message}) so the basics were filled in without it. Check Experience on the Profile page.`;
    draft = normalizeProfile(heuristicProfile(text));
  }
  if (!save) return ok({ draft, model, chars: text.length, warning });
  // Keep job-application facts the person already entered.
  const prev = await loadProfile();
  const merged = prev && !profileIsEmpty(prev)
    ? { ...draft, expectedSalaryLpa: prev.expectedSalaryLpa, currentCtcLpa: prev.currentCtcLpa, noticePeriod: prev.noticePeriod, acceptRemote: prev.acceptRemote, acceptHybrid: prev.acceptHybrid, onsiteCities: prev.onsiteCities }
    : draft;
  const profile = await saveProfile(merged);
  const grilled = profileIsEmpty(profile) ? 0 : (await regrill()).length;
  return ok({ draft: profile, saved: true, grilled, model, chars: text.length, warning });
});
