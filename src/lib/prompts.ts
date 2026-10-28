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
  cover_letter: 'A short cover letter sent as an email with the application: why this role, the two strongest matching proof points, and availability.',
} as const;
export type EmailKind = keyof typeof EMAIL_KINDS;

// Copywriting frameworks for the email body.
export const EMAIL_FRAMEWORKS = {
  plain: 'Relevance, one line of proof, one small ask.',
  aida: 'AIDA: Attention (a specific hook about their team or role), Interest (why you fit), Desire (one proof point with a number), Action (one small ask).',
  pas: 'PAS: Problem (a hiring problem their role suggests), Agitate (why it matters now, briefly), Solution (how your experience solves it, with one proof point), then one small ask.',
} as const;
export type EmailFramework = keyof typeof EMAIL_FRAMEWORKS;

export type WritingTone = 'warm' | 'formal' | 'direct';
export const TONES: Record<WritingTone, string> = {
  warm: 'warm and human, like a colleague writing, still professional.',
  formal: 'formal and polite, suited to large enterprises and senior leaders.',
  direct: 'direct and brief: the point in the first line, no pleasantries.',
};

export function emailMessages(a: {
  kind: EmailKind; framework: EmailFramework; profileText: string; company: string; role?: string; jd?: string;
  recipientName?: string; recipientTitle?: string; previous?: string; senderName?: string;
  tone?: WritingTone; short?: boolean;
}): ChatMessage[] {
  const first = a.recipientName ? a.recipientName.split(' ')[0] : '[Name]';
  const words = a.kind === 'cover_letter' ? (a.short ? 150 : 200) : (a.short ? 80 : 120);
  const system = `You write job-search emails that busy recruiters answer. ${EMAIL_KINDS[a.kind]}

Structure: ${EMAIL_FRAMEWORKS[a.framework]}

Rules:
- Subject: under 8 words, specific (role or company name), no clickbait.
- Body: under ${words} words. Short paragraphs. One clear, small ask (a 10-minute call, a referral, the right contact).
- Open with "Hi ${first}," and close with the candidate's first name only.
- Tone: ${TONES[a.tone ?? 'warm']}
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

// Profile roaster: the "duty vs metric" audit a TA Director would run on a recruiter CV.
export const ROAST_FOCUSES = [
  'Direct-sourcing efficiency and vendor spend',
  'Volume, pipeline velocity and Time-to-Fill',
  'Niche or high-attrition pipelining and Offer-to-Join',
  'Business partner and delivery-director stakeholder management',
  'Sourcing tools, talent mapping and pipeline governance',
] as const;

export function roastMessages(a: { bullets: string; domain?: string; target?: string; profileText?: string }): ChatMessage[] {
  const system = `You are a VP of Talent Acquisition at a top product company or Global Capability Center auditing a Senior Recruiter's CV. Be direct and specific; no encouragement filler.

Tasks:
1. For every original bullet: say in one sentence why an HR Director would pass on it (passive duty language such as "responsible for", "handled", "worked on", "supported"; no volume, no channel mix, no outcome), then give a short verdict (Keep, Rewrite, or Cut) and a rewritten bullet using: Action verb + domain complexity and requisition volume + sourcing channel or method + business outcome (Time-to-Fill, cost-per-hire, Offer-to-Join, vendor dependency, escalations).
2. Write 5 new bullets, one for each focus: ${ROAST_FOCUSES.map((f, i) => `(${i + 1}) ${f}`).join('; ')}.
3. Write a 3-sentence summary for the top of the CV: senior full-cycle ownership at enterprise scale; sourcing depth in the stated domain; immediate availability (0-day notice) for Q4/Q1 requisition backlogs.
4. List the weak phrases you found, exactly as written.

Rules:
- ${NO_FABRICATION}
- Each bullet at most 30 words.
- ${antiSlopInstruction()}

${JSON_ONLY} Shape:
{
  "critique": [ { "original": "", "why_rejected": "", "verdict": "Keep|Rewrite|Cut", "rewrite": "" } ],
  "rewrites": [ { "focus": "", "bullet": "" } ],
  "summary": "",
  "weak_phrases": ["..."]
}`;
  const user = [
    a.domain ? `Hiring domain: ${a.domain}` : null,
    a.target ? `Target employers: ${a.target}` : null,
    `Bullets to audit:\n"""\n${a.bullets}\n"""`,
    a.profileText ? `Rest of the profile, for facts only:\n"""\n${a.profileText.slice(0, 6000)}\n"""` : null,
  ].filter(Boolean).join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// Outreach machine: three sub-60-word messages for LinkedIn DM, referral or email.
export const OUTREACH_KINDS = {
  head_of_ta: { label: 'Head of TA', who: 'a Head of Talent Acquisition or VP HR who owns the open role' },
  peer_referral: { label: 'Peer referral', who: 'an ex-colleague or peer Senior Recruiter at the company, asking for an internal referral' },
  practice_head: { label: 'Practice Head', who: 'a Managing Director or Practice Head whose team is short on hiring bandwidth' },
} as const;
export type OutreachKind = keyof typeof OUTREACH_KINDS;

export function outreachMessages(a: {
  company: string; role?: string; req?: string; recipientName?: string; recipientTitle?: string; profileText: string;
}): ChatMessage[] {
  const first = a.recipientName ? a.recipientName.split(' ')[0] : '[Name]';
  const system = `You write short LinkedIn messages for a Senior Recruiter (ex-Capgemini) looking for a TA role. Write three messages, one per recipient:
${Object.entries(OUTREACH_KINDS).map(([k, v]) => `- ${k}: to ${v.who}.`).join('\n')}

Each message follows this order: a specific observation or the req itself, one line of enterprise-scale proof from the profile, the immediate 0-day joining advantage, then one low-friction ask (a 10-minute call, a referral, or the right person to speak to).

Rules:
- Under 60 words each. Count them.
- Open with "Hi ${first}," and sign off with the candidate's first name.
- No "I hope this finds you well", no "I am writing to", no emojis, no hashtags.
- ${NO_FABRICATION}
- ${antiSlopInstruction()}

${JSON_ONLY} Shape: { "head_of_ta": "", "peer_referral": "", "practice_head": "" }`;
  const user = [
    `Company: ${a.company}`,
    a.role ? `Role: ${a.role}` : null,
    a.recipientName || a.recipientTitle ? `Recipient: ${[a.recipientName, a.recipientTitle].filter(Boolean).join(', ')}` : null,
    a.req ? `Req details or link:\n"""\n${a.req.slice(0, 3000)}\n"""` : null,
    `Candidate profile:\n"""\n${a.profileText.slice(0, 6000)}\n"""`,
  ].filter(Boolean).join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// Career gap scripts: one for a screening email, one to say on a phone screen.
export function gapMessages(a: { gapSince: string; reason?: string; profileText: string }): ChatMessage[] {
  const system = `You coach a Senior Recruiter (ex-Capgemini) through explaining a career gap. Write two scripts:
- "email": 3-4 sentences for a screening email.
- "phone": 4-6 conversational sentences to say on a recruiter phone screen.

Both: state the gap plainly without apologising; frame the time as a deliberate reset plus upskilling (use the reason given, or AI-assisted sourcing and market mapping if none); end on the advantage of joining immediately with a 0-day notice period, compared with candidates on 60 to 90 day notice.

Rules:
- ${NO_FABRICATION}
- First person, plain spoken English.
- ${antiSlopInstruction()}

${JSON_ONLY} Shape: { "email": "", "phone": "" }`;
  const user = [
    `Out of work since: ${a.gapSince}`,
    a.reason ? `What the time was used for: ${a.reason}` : null,
    `Candidate profile:\n"""\n${a.profileText.slice(0, 5000)}\n"""`,
  ].filter(Boolean).join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}
