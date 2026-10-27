// Prompt builders for the AI brain. Each returns OpenAI-style chat messages.
// Ground rule for both: never invent numbers. Where the user gave no figure,
// the model must leave a [bracketed] slot to fill, because a TA director will
// ask how every number was calculated.

export const METRIC_CATEGORIES = [
  'time_to_fill',
  'direct_sourcing_ratio',
  'offer_to_join',
  'stakeholder_management',
  'agency_cost_savings',
];

const NO_FABRICATION = `Never invent numbers, companies, tools or achievements. Use a figure only if the user's text contains it. Where a number is needed and missing, write a bracketed slot such as [X], [A]% to [B]%, [N] roles or ₹[X] lakh so the user fills in a figure they can defend in an interview.`;

export function auditProfileMessages({ bullets, years, domain }) {
  const system = `You are a Head of Talent Acquisition at a Bengaluru Global Capability Center who screens Senior Recruiter and TA Partner CVs. You are blunt and specific. You are reviewing the CV of a Senior Recruiter who left Capgemini (an IT services firm) and is available to join immediately with no notice period or buyout.

Your job: find weak, passive or duty-based phrasing ("responsible for", "handled", "involved in", "worked on", "assisted", "end-to-end recruitment" with no outcome) and rewrite it as outcome-led, metric-backed lines that survive a TA director's follow-up questions.

${NO_FABRICATION}

Reply with one JSON object and nothing else. No markdown fences. Shape:
{
  "weak_phrases": [
    {
      "original": "the exact weak phrase or bullet from the input",
      "problem": "one short sentence on why a TA director passes on it",
      "rewrite": "the hardened bullet, starting with a strong past-tense verb",
      "category": "one of: ${METRIC_CATEGORIES.join(', ')}, other"
    }
  ],
  "metrics": [
    {
      "category": "one of: ${METRIC_CATEGORIES.join(', ')}",
      "bullet": "an enterprise-grade CV bullet for this metric",
      "how_to_defend": "one sentence on how to calculate or evidence the number if asked"
    }
  ],
  "pitch": "exactly two sentences"
}

Rules:
- weak_phrases: one entry per weak bullet or phrase found, in input order, at most 10. If a bullet is already strong, leave it out.
- metrics: exactly 5 entries, one per category, in this order: ${METRIC_CATEGORIES.join(', ')}. Use the user's own numbers where present.
- Indian market vocabulary is fine: Naukri RMS, LinkedIn Recruiter, offer-to-join (OTJ), GCC, notice period, buyout, lakh.
- pitch: two sentences for a recruiter screen or LinkedIn About opener. Sentence 1: who they are and the proof. Sentence 2: immediate availability (0-day notice, no buyout) and what they take on from week one.`;

  const context = [
    years ? `Years of recruiting experience: ${years}` : null,
    domain ? `Hiring domains: ${domain}` : null,
  ].filter(Boolean).join('\n');

  const user = `${context ? context + '\n\n' : ''}Capgemini experience bullets:\n"""\n${bullets}\n"""`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export const OUTREACH_AUDIENCES = {
  head_of_ta: {
    label: 'Head of TA',
    brief: 'Head of TA, TA Manager or VP HR with an active opening. Reference the specific role and how recently it was posted. Ask for a 10-minute call this week.',
  },
  peer_referral: {
    label: 'Peer Referral',
    brief: 'An ex-colleague or peer recruiter at the company, asking for a referral. Friendly, informal. Offer to send a 3-line blurb and resume so it takes them two minutes, and offer to send candidates for their reqs in return.',
  },
  practice_head: {
    label: 'Practice Head',
    brief: 'An MD, Practice Head or delivery leader with a hiring backlog. Lead with the backlog (open roles, how long they have been live). Offer to start immediately, contract or full time, to clear part of it. If writing to a business head, it is fine to mention looping in their TA lead.',
  },
};

export function outreachMessages({ company, recipientTitle, roleUrl, reqDetails, proofPoints, audiences }) {
  const audienceText = audiences
    .map((key) => `- "${key}": ${OUTREACH_AUDIENCES[key].brief}`)
    .join('\n');

  const system = `You write cold outreach for a Senior Recruiter who left Capgemini and can join immediately (no 60-90 day notice, no buyout). They are targeting Senior Recruiter and Talent Acquisition roles in Bengaluru or remote India.

Every message follows this order: (1) what you noticed about their hiring, (2) one line of proof from Capgemini, (3) immediate joining, (4) one small, specific ask.

Hard rules:
- Each message is UNDER 60 words. Count them. Aim for 40 to 55.
- Plain text, ready for a LinkedIn DM or short email. No subject line, no hashtags, no emojis, no sign-off block.
- Open with "Hi [Name]," (or "Hey [Name]!" for a peer). Keep [Name] as a literal slot.
- Sound like a sharp recruiter writing to another recruiter, not a cover letter. No "I hope this finds you well", no "I am writing to express".
- ${NO_FABRICATION}

Reply with one JSON object and nothing else. No markdown fences. Shape:
{ "messages": [ { "audience": "<key>", "message": "<text>" } ] }

Write exactly one message for each of these audiences, in this order:
${audienceText}`;

  const lines = [
    `Target company: ${company}`,
    `Recipient title: ${recipientTitle}`,
    roleUrl ? `Role URL: ${roleUrl}` : null,
    reqDetails ? `Req details: ${reqDetails}` : null,
    proofPoints
      ? `Candidate's own proof points (the only numbers you may use):\n${proofPoints}`
      : 'Candidate gave no proof points. Use bracketed slots for every number.',
  ].filter(Boolean);

  return [
    { role: 'system', content: system },
    { role: 'user', content: lines.join('\n') },
  ];
}

// ---- v2: profile-aware prompts ------------------------------------------------

// Compact plain-text view of the saved profile for prompts.
export function profileToText(p = {}) {
  const lines = [];
  if (p.name) lines.push(`Name: ${p.name}`);
  if (p.headline) lines.push(`Headline: ${p.headline}`);
  if (p.location) lines.push(`Location: ${p.location}`);
  if (p.years) lines.push(`Years of experience: ${p.years}`);
  if (p.notice) lines.push(`Notice period / availability: ${p.notice}`);
  if (p.summary) lines.push(`Summary: ${p.summary}`);
  if (p.skills?.length) lines.push(`Skills: ${p.skills.join(', ')}`);
  for (const e of p.experience || []) {
    lines.push(`\n${e.title || ''} at ${e.company || ''} (${[e.start, e.end || 'present'].filter(Boolean).join(' - ')})${e.location ? `, ${e.location}` : ''}`);
    for (const b of e.bullets || []) lines.push(`- ${b}`);
  }
  for (const ed of p.education || []) lines.push(`Education: ${[ed.degree, ed.school, ed.end].filter(Boolean).join(', ')}`);
  if (p.certifications?.length) lines.push(`Certifications: ${p.certifications.join('; ')}`);
  if (p.achievements?.length) lines.push(`Achievements: ${p.achievements.join('; ')}`);
  if (p.proof_points) lines.push(`Proof points the candidate can defend:\n${p.proof_points}`);
  return lines.join('\n');
}

const JSON_ONLY = 'Reply with one JSON object and nothing else. No markdown fences.';

export function jdMatchMessages({ profileText, jd, title, company }) {
  const system = `You are a demanding hiring manager and an ATS expert screening a candidate against a job description. Grill the profile honestly: a high score must be earned by evidence in the profile, not by similar-sounding words.

${NO_FABRICATION}

${JSON_ONLY} Shape:
{
  "score": 0-100 integer (how likely this profile gets shortlisted as-is),
  "verdict": "apply now" | "apply after tailoring" | "stretch" | "skip",
  "summary": "two sentences: the fit and the biggest risk",
  "must_haves": [ { "requirement": "...", "status": "met" | "partial" | "missing", "evidence": "where in the profile, or why missing" } ],
  "strengths": ["short bullet", ...],
  "gaps": [ { "gap": "...", "severity": "high" | "medium" | "low", "fix": "what to add, reframe or learn" } ],
  "missing_keywords": ["ATS keywords from the JD absent from the profile"],
  "resume_edits": ["specific bullet rewrites or additions, with [X] slots for numbers"],
  "interview_questions": [ { "question": "...", "why_they_ask": "...", "answer_outline": "using the candidate's real experience" } ],
  "red_flags": ["anything a screener would question: gaps, job hopping, location, notice, level"]
}
Limits: must_haves up to 10, strengths up to 6, gaps up to 8, missing_keywords up to 20, resume_edits up to 8, interview_questions exactly 6.`;
  const user = `JOB: ${[title, company].filter(Boolean).join(' at ') || '(untitled)'}\n"""\n${jd}\n"""\n\nCANDIDATE PROFILE:\n"""\n${profileText}\n"""`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function tailorResumeMessages({ profileJson, jd, title, company, gaps }) {
  const system = `You are an expert resume writer. Tailor the candidate's resume to one job using the formats that win interviews: reverse-chronological, a 2-3 line summary aimed at the role, a skills line ordered by JD relevance, and 3-6 bullets per recent role that start with a strong verb and state an outcome (Action + Scope + Result).

Rules:
- Use ONLY facts from the profile JSON. You may reorder, rephrase, merge, and drop content. Never add an employer, title, date, degree, tool or certification that is not in the profile.
- ${NO_FABRICATION}
- Mirror exact JD keywords where the profile genuinely supports them (ATS matching).
- Keep it to one page for under 8 years of experience, two pages otherwise. Older roles get 1-2 bullets.
- No first person, no tables, no graphics.

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
  const user = `TARGET JOB: ${[title, company].filter(Boolean).join(' at ')}\n"""\n${jd}\n"""\n${gaps ? `\nKnown gaps from the screen:\n${gaps}\n` : ''}\nPROFILE JSON:\n${profileJson}`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function parseResumeMessages({ text }) {
  const system = `Convert the resume text into structured JSON. Copy facts exactly; do not improve, summarize away, or invent anything. Keep every bullet. Dates as written (e.g. "Jan 2021", "2019").

${JSON_ONLY} Shape:
{
  "name": "", "headline": "", "email": "", "phone": "", "location": "", "linkedin": "", "portfolio": "",
  "years": "total years of experience if stated or clearly computable, else empty",
  "summary": "",
  "skills": ["..."],
  "experience": [ { "company": "", "title": "", "location": "", "start": "", "end": "", "bullets": ["..."] } ],
  "education": [ { "school": "", "degree": "", "start": "", "end": "", "details": "" } ],
  "certifications": ["..."],
  "achievements": ["..."]
}`;
  return [{ role: 'system', content: system }, { role: 'user', content: `RESUME TEXT:\n"""\n${text}\n"""` }];
}

export const EMAIL_KINDS = {
  cold: 'A first cold email to a recruiter or hiring manager about a specific open role.',
  referral: 'A request to an employee at the company for a referral to a specific role. Make it easy: offer a 3-line blurb.',
  follow_up: 'A short, polite follow-up to an earlier email that got no reply. Add one new piece of value; do not guilt-trip.',
  thank_you: 'A thank-you note after an interview that reinforces one strong point from the conversation.',
};

export function emailMessages({ kind, profileText, company, role, jd, recipientName, recipientTitle, previous }) {
  const system = `You write job-search emails that busy recruiters actually answer. ${EMAIL_KINDS[kind]}

Rules:
- Subject: under 8 words, specific (role or company name), no clickbait.
- Body: under 120 words. Short paragraphs. One clear, small ask (a 10-minute call, a referral, the right contact).
- Open with "Hi ${recipientName ? recipientName.split(' ')[0] : '[Name]'}," and close with the candidate's first name only.
- Lead with what is relevant to their open role, then one line of proof from the profile, then the ask.
- No "I hope this finds you well", no "I am writing to express", no emojis, no attachments mentioned unless asked.
- ${NO_FABRICATION}

${JSON_ONLY} Shape: { "subject": "...", "body": "..." }`;
  const lines = [
    `Company: ${company}`,
    role ? `Role: ${role}` : null,
    recipientTitle ? `Recipient: ${[recipientName, recipientTitle].filter(Boolean).join(', ')}` : null,
    jd ? `Job description (excerpt):\n"""\n${jd.slice(0, 4000)}\n"""` : null,
    previous ? `Earlier email that got no reply:\n"""\n${previous}\n"""` : null,
    `Candidate profile:\n"""\n${profileText}\n"""`,
  ].filter(Boolean);
  return [{ role: 'system', content: system }, { role: 'user', content: lines.join('\n\n') }];
}

export function extractJobMessages({ text, url }) {
  const system = `Extract the job posting from this web page text. Copy the description faithfully (requirements, responsibilities); drop navigation, cookie banners and unrelated listings.

${JSON_ONLY} Shape:
{ "title": "", "company": "", "location": "", "salary": "", "description": "", "is_job_posting": true }
Set is_job_posting to false if the page is not a single job posting.`;
  return [{ role: 'system', content: system }, { role: 'user', content: `URL: ${url || 'unknown'}\n\nPAGE TEXT:\n"""\n${text}\n"""` }];
}
