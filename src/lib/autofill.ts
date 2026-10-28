// The Browser's Auto-Fill: an answer for every field of an application form,
// from the master profile, with the model drafting the free-text questions.
// The person copies each answer into the real form and presses Submit there.
import type { FormField } from './html';
import type { ProfileInput } from './profile';
import { applicationFacts, profileToText } from './profile';
import type { ChatMessage, LlmConfig } from './llm/client';
import { antiSlopInstruction } from './modules/anti-slop';
import { writeClean } from './writer';

export type Answer = { key: string; label: string; type: FormField['type']; required: boolean; value: string; source: 'profile' | 'ai' | 'you'; note?: string; options?: string[] };

// Fields almost every application asks for, used when the page exposes no form.
export const STANDARD_FIELDS: FormField[] = [
  { key: 'first_name', label: 'First name', type: 'text', required: true },
  { key: 'last_name', label: 'Last name', type: 'text', required: true },
  { key: 'email', label: 'Email', type: 'email', required: true },
  { key: 'phone', label: 'Phone', type: 'tel', required: true },
  { key: 'location', label: 'Current location', type: 'text', required: false },
  { key: 'linkedin', label: 'LinkedIn profile', type: 'url', required: false },
  { key: 'current_company', label: 'Current or last company', type: 'text', required: false },
  { key: 'current_title', label: 'Current or last title', type: 'text', required: false },
  { key: 'experience', label: 'Total years of experience', type: 'number', required: false },
  { key: 'current_ctc', label: 'Current CTC (LPA)', type: 'text', required: false },
  { key: 'expected_ctc', label: 'Expected CTC (LPA)', type: 'text', required: false },
  { key: 'notice', label: 'Notice period', type: 'text', required: false },
  { key: 'resume', label: 'Resume / CV', type: 'file', required: true },
  { key: 'why_company', label: 'Why do you want to work here?', type: 'textarea', required: false },
];

// The fourth item marks rules that also answer a question-style label ("When can you join?").
type Rule = [RegExp, (p: ProfileInput) => string, string?, boolean?];
const first = (p: ProfileInput) => p.name.trim().split(/\s+/)[0] || '';
const last = (p: ProfileInput) => p.name.trim().split(/\s+/).slice(1).join(' ');
const lpa = (n: number | null) => (n ? `${n} LPA` : '');

// Label patterns, most specific first.
const RULES: Rule[] = [
  [/first\s*name|given name|^name\s*\(first/i, first],
  [/last\s*name|surname|family name/i, last],
  [/preferred name/i, first],
  [/full\s*name|^name\b|your name|legal name/i, (p) => p.name],
  [/e-?mail/i, (p) => p.email],
  [/phone( number)?\b(?! screen| interview| call)|mobile|contact number/i, (p) => p.phone],
  [/linked\s*in/i, (p) => p.linkedin],
  [/portfolio|website|personal (site|url)|github/i, (p) => p.portfolio],
  [/expected (ctc|salary|compensation|pay)|(salary|compensation|pay|ctc) expectations?|desired (salary|pay|compensation)/i, (p) => lpa(p.expectedSalaryLpa), 'Your expected CTC from Profile.', true],
  [/current (ctc|salary|compensation)|present (ctc|salary)/i, (p) => lpa(p.currentCtcLpa), undefined, true],
  [/notice period|when can you (start|join)|earliest start|availability to join|joining date/i, (p) => p.noticePeriod, undefined, true],
  [/current (company|employer|organi[sz]ation)|most recent (company|employer)|^company$|^org$/i, (p) => p.experience[0]?.company || ''],
  [/current (title|role|designation|position)|job title|most recent title/i, (p) => p.experience[0]?.title || ''],
  [/years of (relevant )?experience|total experience|how many years/i, (p) => (p.yearsExperience ? String(p.yearsExperience) : ''), undefined, true],
  [/(current )?(location|city)|where are you based|^address/i, (p) => p.location],
  [/where are you (currently )?(based|located)/i, (p) => p.location, undefined, true],
  [/school|university|college/i, (p) => p.education[0]?.school || ''],
  [/degree|qualification/i, (p) => p.education[0]?.degree || ''],
];

// A placeholder the model left for the person: [X], [Name], ₹[X] lakh.
export const SLOT = /\[(?!Check\])[A-Za-z][A-Za-z ]{0,20}\]/;

const FREE_TEXT = /why|tell us|describe|cover letter|additional information|anything else|motivat|interest(ed)? in|about yourself|summary|example of|how would you/i;

// Only the person knows these; a profile field would be a wrong answer.
const ONLY_YOU = /hear about|how did you (find|learn)|refer(red|rer|ral)|source of application/i;
// Yes/no questions ("Will you require sponsorship?") are never filled from a profile field.
const YES_NO = /^\s*(are|do|does|did|will|would|have|has|had|is|can|could|should|were|was)\b/i;
const QUESTION = /\?\s*\*?\s*$|^\s*(what|when|where|which|how|who)\b/i;

export function mapField(f: FormField, p: ProfileInput): Answer {
  const base = { key: f.key, label: f.label, type: f.type, required: f.required, options: f.options };
  if (f.type === 'file') {
    return { ...base, value: /cover/i.test(f.label) ? '' : 'Attach your tailored resume (Resume tab)', source: 'you', note: /cover/i.test(f.label) ? 'Use the cover letter from the Email tab.' : undefined };
  }
  if (ONLY_YOU.test(f.label)) return { ...base, value: '', source: 'you', note: 'Only you know this one.' };
  if (YES_NO.test(f.label)) return { ...base, value: '', source: 'ai' };
  const question = QUESTION.test(f.label);
  if (!FREE_TEXT.test(f.label) || f.type !== 'textarea') {
    for (const [re, get, note, answersQuestion] of RULES) {
      if (question && !answersQuestion) continue;
      if (re.test(f.label) || (!question && re.test(f.key.replace(/[_\-[\]]+/g, ' ')))) {
        const value = get(p);
        // A dropdown only takes one of its own options.
        if (f.options?.length) {
          const hit = value && f.options.find((o) => o.trim().toLowerCase() === value.trim().toLowerCase());
          if (hit) return { ...base, value: hit, source: 'profile', note };
          return { ...base, value: '', source: 'ai' };
        }
        return { ...base, value, source: value ? 'profile' : 'you', note: value ? note : 'Add this to your Profile once and it fills every form.' };
      }
    }
  }
  return { ...base, value: '', source: 'ai' };
}

function questionMessages(a: { questions: Answer[]; company: string; role: string; jd: string; profile: ProfileInput }): ChatMessage[] {
  const system = `You fill in job application questions for the candidate, in the first person, from their profile only.
Rules:
- Free-text answers: 40 to 120 words, specific to the company and role, using real facts from the profile. Never invent numbers, employers or tools.
- These answers are pasted into the real form as they are: never write placeholders such as [X], [Name] or [Company]. If a figure is missing, write the sentence without it.
- Pay, notice period, location and commute questions: answer from the APPLICATION FACTS. Give pay as the expected CTC in LPA. If the job is outside the places the candidate is open to, say so plainly (for example "No, I am based in Bengaluru").
- For a question with options, reply with exactly one of the options.
- For a yes/no eligibility question you cannot answer from the profile, reply "[Check]".
- ${antiSlopInstruction()}
Reply with one JSON object and nothing else: { "answers": { "<key>": "<answer>" } }`;
  const user = [
    `Company: ${a.company}`,
    `Role: ${a.role}`,
    `Job description (excerpt):\n"""\n${a.jd.slice(0, 3500)}\n"""`,
    `Questions:\n${a.questions.map((q) => `- key "${q.key}": ${q.label}${q.options?.length ? ` (options: ${q.options.join(' | ')})` : ''}`).join('\n')}`,
    `Candidate profile:\n"""\n${profileToText(a.profile).slice(0, 6000)}\n"""`,
    `APPLICATION FACTS:\n${applicationFacts(a.profile)}`,
  ].join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export async function buildAnswerSheet(cfg: LlmConfig | null, a: {
  fields: FormField[]; profile: ProfileInput; company: string; role: string; jd: string; extra?: string[];
}) {
  const fields = a.fields.length ? a.fields : STANDARD_FIELDS;
  const answers = fields.map((f) => mapField(f, a.profile));
  const open = answers.filter((x) => x.source === 'ai').slice(0, 10);
  let model: string | null = null;
  if (open.length && cfg) {
    const out = await writeClean<{ answers?: Record<string, string> }>(cfg, questionMessages({ questions: open, company: a.company, role: a.role, jd: a.jd, profile: a.profile }), {
      maxTokens: 2500, temperature: 0.4, extra: a.extra,
    });
    model = out.model;
    const got = out.data?.answers || {};
    for (const q of open) {
      const v = String(got[q.key] ?? '').trim().slice(0, 2000);
      q.value = v;
      if (!v) q.source = 'you';
      // A slot left in the text would be pasted into the form as it is.
      else if (SLOT.test(v)) Object.assign(q, { source: 'you', note: 'Fill in the part in [brackets] before you paste this.' });
    }
  }
  for (const q of answers) if (q.source === 'ai' && !q.value) q.source = 'you';
  return { answers, generic: !a.fields.length, model };
}
