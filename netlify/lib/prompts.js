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
