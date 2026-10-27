// Master profile (the source of truth for resumes, JD grill and emails) and resume import.
import { HttpError, json, str } from '../http.js';
import { llmConfig, chatJson, asText, asList } from '../llm.js';
import { parseResumeMessages } from '../prompts.js';
import { extractText } from '../extract.js';

const FIELDS = ['name', 'headline', 'email', 'phone', 'location', 'linkedin', 'portfolio', 'years', 'notice',
  'current_ctc', 'expected_ctc', 'summary', 'proof_points'];

// Accepts loose input (from the form or the model) and returns a clean profile.
export function normalizeProfile(input = {}) {
  const p = {};
  for (const f of FIELDS) p[f] = asText(input[f], f === 'summary' || f === 'proof_points' ? 4000 : 300);
  p.skills = asList(input.skills, 60, 80);
  p.certifications = asList(input.certifications, 20, 300);
  p.achievements = asList(input.achievements, 20, 600);
  p.experience = (Array.isArray(input.experience) ? input.experience : []).slice(0, 20).map((e) => ({
    company: asText(e?.company, 200),
    title: asText(e?.title, 200),
    location: asText(e?.location, 200),
    start: asText(e?.start, 40),
    end: asText(e?.end, 40),
    bullets: asList(e?.bullets, 15, 600),
  })).filter((e) => e.company || e.title);
  p.education = (Array.isArray(input.education) ? input.education : []).slice(0, 10).map((e) => ({
    school: asText(e?.school, 200),
    degree: asText(e?.degree, 200),
    start: asText(e?.start, 40),
    end: asText(e?.end, 40),
    details: asText(e?.details, 600),
  })).filter((e) => e.school || e.degree);
  return p;
}

export async function loadProfile(sql) {
  const [row] = await sql`SELECT data, updated_at FROM profile WHERE id = 1`;
  return row ? { ...normalizeProfile(row.data), updated_at: row.updated_at } : null;
}

export async function requireProfile(sql) {
  const p = await loadProfile(sql);
  if (!p || (!p.experience.length && !p.summary)) {
    throw new HttpError(400, 'Fill in your profile first (Profile tab: import your resume or add experience).');
  }
  return p;
}

async function saveProfile(sql, data) {
  const clean = normalizeProfile(data);
  await sql`
    INSERT INTO profile (id, data, updated_at) VALUES (1, ${JSON.stringify(clean)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
  return clean;
}

async function get(ctx) {
  return json(200, { profile: await loadProfile(ctx.sql) });
}

async function put(ctx) {
  const { profile } = await ctx.body(256 * 1024);
  if (!profile || typeof profile !== 'object') throw new HttpError(400, 'Send { "profile": {...} }.');
  return json(200, { profile: await saveProfile(ctx.sql, profile) });
}

// Upload a PDF/DOCX/TXT resume (base64), extract text, let the model structure it.
// Returns a draft; the app shows it for review and then PUTs the profile.
async function importResume(ctx) {
  const body = await ctx.body(6 * 1024 * 1024);
  let text = str(body.text, 'text', { max: 60000 });
  if (!text) {
    const filename = str(body.filename, 'filename', { required: true, max: 200 });
    const b64 = str(body.data_base64, 'data_base64', { required: true, max: 5_600_000 });
    text = await extractText(filename, Buffer.from(b64, 'base64'));
  }
  if (!text || text.trim().length < 80) {
    throw new HttpError(422, 'Could not read text from that file. If it is a scanned PDF, export it as a text PDF or DOCX.');
  }
  const cfg = llmConfig();
  const out = await chatJson(cfg, parseResumeMessages({ text: text.slice(0, 40000) }), { maxTokens: 6000, temperature: 0 });
  const draft = normalizeProfile(out.data);
  return json(200, { draft, model: out.model, chars: text.length });
}

export default [
  ['GET', '/api/profile', get],
  ['PUT', '/api/profile', put],
  ['POST', '/api/profile/import', importResume],
];
