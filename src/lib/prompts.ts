// Prompt builders. Each returns chat messages for llm/client.ts.
// Ground rule for all of them: never invent facts or numbers.
import type { ChatMessage } from './llm/client';
import { antiSlopInstruction } from './modules/anti-slop';

const NO_FABRICATION = 'Never invent numbers, employers, titles, tools or achievements. Use a figure only if the source text contains it. Where a number is needed and missing, write a bracketed slot such as [X], [N] roles or ₹[X] lakh so the person fills in a figure they can defend in an interview.';
const JSON_ONLY = 'Reply with one JSON object and nothing else. No markdown fences.';

export function parseResumeMessages(text: string): ChatMessage[] {
  const system = `Convert the resume text into structured JSON. Copy facts exactly; do not improve, summarise away, or invent anything. Keep every bullet. Dates as written (e.g. "Jan 2021", "2019").

${JSON_ONLY} Shape:
{
  "name": "", "headline": "", "email": "", "phone": "", "location": "", "linkedin": "", "portfolio": "",
  "yearsExperience": number or null (total years if stated or clearly computable),
  "summary": "",
  "skills": ["..."],
  "experience": [ { "company": "", "title": "", "location": "", "start": "", "end": "", "bullets": ["..."] } ],
  "education": [ { "school": "", "degree": "", "start": "", "end": "", "details": "" } ],
  "certifications": ["..."],
  "achievements": ["..."]
}`;
  return [{ role: 'system', content: system }, { role: 'user', content: `RESUME TEXT:\n"""\n${text}\n"""` }];
}

export function tailorResumeMessages(a: { profileJson: string; jd: string; title: string; company: string; missing: string[] }): ChatMessage[] {
  const system = `You are an expert resume writer. Tailor the candidate's resume to one job: reverse-chronological, a 2-3 line summary aimed at the role, a skills list ordered by relevance to the JD, and 3-6 bullets per recent role that start with a strong verb and state an outcome (action, scope, result).

Rules:
- Use ONLY facts from the profile JSON. You may reorder, rephrase, merge and drop content. Never add an employer, title, date, degree, tool or certification that is not in the profile.
- ${NO_FABRICATION}
- Mirror exact JD keywords where the profile genuinely supports them (ATS matching).
- One page under 8 years of experience, two pages otherwise. Older roles get 1-2 bullets. Each bullet at most 2 lines (about 30 words).
- No first person.
- ${antiSlopInstruction()}

${JSON_ONLY} Shape (same structure as the input profile):
{
  "name": "", "headline": "role-aligned headline", "email": "", "phone": "", "location": "", "linkedin": "", "portfolio": "",
  "summary": "",
  "skills": ["..."],
  "experience": [ { "company": "", "title": "", "location": "", "start": "", "end": "", "bullets": ["..."] } ],
  "education": [ { "school": "", "degree": "", "start": "", "end": "", "details": "" } ],
  "certifications": ["..."],
  "achievements": ["..."],
  "notes_for_candidate": ["what to verify, which [X] slots to fill"]
}`;
  const user = `TARGET JOB: ${[a.title, a.company].filter(Boolean).join(' at ')}
"""
${a.jd}
"""
${a.missing.length ? `\nJD skills the Grill could not find in the profile (only use them if the profile genuinely supports them): ${a.missing.join(', ')}\n` : ''}
PROFILE JSON:
${a.profileJson}`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export const EMAIL_KINDS = {
  cold: 'A first cold email to a recruiter or hiring manager about a specific open role.',
  referral: 'A request to an employee at the company for a referral to a specific role. Make it easy: offer a 3-line blurb.',
  follow_up: 'A short, polite follow-up to an earlier email that got no reply. Add one new piece of value; no guilt-tripping.',
  thank_you: 'A thank-you note after an interview that reinforces one strong point from the conversation.',
} as const;
export type EmailKind = keyof typeof EMAIL_KINDS;

// Copywriting frameworks for the email body.
export const EMAIL_FRAMEWORKS = {
  plain: 'Relevance, one line of proof, one small ask.',
  aida: 'AIDA: Attention (a specific hook about their team or role), Interest (why you fit), Desire (one proof point with a number), Action (one small ask).',
  pas: 'PAS: Problem (a hiring problem their role suggests), Agitate (why it matters now, briefly), Solution (how your experience solves it, with one proof point), then one small ask.',
} as const;
export type EmailFramework = keyof typeof EMAIL_FRAMEWORKS;

export function emailMessages(a: {
  kind: EmailKind; framework: EmailFramework; profileText: string; company: string; role?: string; jd?: string;
  recipientName?: string; recipientTitle?: string; previous?: string; senderName?: string;
}): ChatMessage[] {
  const first = a.recipientName ? a.recipientName.split(' ')[0] : '[Name]';
  const system = `You write job-search emails that busy recruiters answer. ${EMAIL_KINDS[a.kind]}

Structure: ${EMAIL_FRAMEWORKS[a.framework]}

Rules:
- Subject: under 8 words, specific (role or company name), no clickbait.
- Body: under 120 words. Short paragraphs. One clear, small ask (a 10-minute call, a referral, the right contact).
- Open with "Hi ${first}," and close with the candidate's first name only.
- No "I hope this finds you well", no "I am writing to express", no emojis.
- ${NO_FABRICATION}
- ${antiSlopInstruction()}

${JSON_ONLY} Shape: { "subject": "...", "body": "..." }`;
  const lines = [
    `Company: ${a.company}`,
    a.role ? `Role: ${a.role}` : null,
    a.recipientTitle || a.recipientName ? `Recipient: ${[a.recipientName, a.recipientTitle].filter(Boolean).join(', ')}` : null,
    a.jd ? `Job description (excerpt):\n"""\n${a.jd.slice(0, 4000)}\n"""` : null,
    a.previous ? `Earlier email that got no reply:\n"""\n${a.previous}\n"""` : null,
    `Candidate profile:\n"""\n${a.profileText}\n"""`,
  ].filter(Boolean);
  return [{ role: 'system', content: system }, { role: 'user', content: lines.join('\n\n') }];
}
