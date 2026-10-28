// Enums shared by the evaluation's server code and its panel.
export const IMPORTANCE = ['critical', 'high', 'meaningful', 'preferred', 'low_signal'] as const;
export const TIERS = ['stated', 'structural', 'inferred'] as const;
export const MATCH = ['strong', 'partial', 'missing', 'na'] as const;
export const EVIDENCE = ['supported', 'partial', 'unknown'] as const;
export const DIMENSIONS = { cv: 'CV match', northStar: 'Fits your target roles', comp: 'Pay', culture: 'Culture signals', redFlags: 'Red flags' } as const;


// Career-Ops modes beyond the evaluation: what each one is for and what it asks for.
export const MODE_META = {
  interview_prep: { label: 'Interview prep', scope: 'job' as const, blurb: 'Rounds, likely questions per interviewer, answers from your CV, stories to use, questions to ask back.', input: { label: 'Interview invite or notes (optional)', placeholder: 'Paste the invite, round names, panel names and titles…', required: false } },
  research: { label: 'Company research', scope: 'job' as const, blurb: 'Recent moves, hiring in India, TA team and culture, likely challenges, competitors, and your angle.', input: null },
  contacts: { label: 'Who to contact', scope: 'job' as const, blurb: 'Saved contacts first, then public LinkedIn results for the recruiter or hiring manager, with a note under 300 characters. You send it yourself.', input: null },
  negotiate: { label: 'Negotiate pay', scope: 'job' as const, blurb: 'Scripts for the pay question, a lowball offer, a competing offer, and the gap, using your numbers.', input: { label: 'What they offered or said (optional)', placeholder: 'e.g. Fixed 24 LPA + 10% variable, joining bonus 1L, 60-day notice expected…', required: false } },
  offer_review: { label: 'Read an offer letter', scope: 'job' as const, blurb: 'Clause by clause in plain English, what is missing, what differs from the JD, questions for HR and for a lawyer. Not legal advice.', input: { label: 'Offer letter text', placeholder: 'Paste the offer letter or contract…', required: true } },
  redflag: { label: 'Red flags from interviews', scope: 'job' as const, blurb: 'Paste your interview notes: warning signs, scope or pay that does not match the JD, and questions they should not ask.', input: { label: 'Interview notes', placeholder: 'What they said, what they asked, how it felt, round by round…', required: true } },
  debrief: { label: 'Interview debrief', scope: 'job' as const, blurb: 'Paste what happened: what went well, gaps to close before the next round, and a thank-you note.', input: { label: 'What happened in the interview', placeholder: 'Who you met, what they asked, how you answered, what felt weak…', required: true } },
  reply: { label: 'Sort a recruiter reply', scope: 'global' as const, blurb: 'Paste an email or message from an employer: what it means, which job it is about, the status to set, and a reply draft.', input: { label: 'The reply you received', placeholder: 'Paste the email or LinkedIn message…', required: true } },
  titles: { label: 'Adjacent job titles', scope: 'global' as const, blurb: 'Titles you qualify for but may not be searching, to widen the job feed. You choose which to add.', input: null },
  upskill: { label: 'Skill gaps', scope: 'global' as const, blurb: 'The skills your saved jobs keep asking for that your profile lacks, and a short learning plan with free resources.', input: null },
  patterns: { label: 'What is working', scope: 'global' as const, blurb: 'Your funnel, scores against outcomes, and which kinds of jobs move forward, with changes to make.', input: null },
};
export type ModeId = keyof typeof MODE_META;
