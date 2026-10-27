import { HttpError, ok, route } from '@/lib/http';
import { extractText } from '@/lib/extract';
import { chatJson, llmConfig } from '@/lib/llm/client';
import { parseResumeMessages } from '@/lib/prompts';
import { normalizeProfile } from '@/lib/profile';
import { loadSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Upload a PDF/DOCX/TXT resume (multipart "file") or send { text }. The model
// structures it; the app shows the draft for review before saving the profile.
export const POST = route(async (req: Request) => {
  let text = '';
  const type = req.headers.get('content-type') || '';
  if (type.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    const pasted = form.get('text');
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
  const cfg = llmConfig(await loadSettings());
  const out = await chatJson(cfg, parseResumeMessages(text.slice(0, 40000)), { maxTokens: 6000, temperature: 0 });
  return ok({ draft: normalizeProfile(out.data), model: out.model, chars: text.length });
});
