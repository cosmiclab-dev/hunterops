// Module D: The Grill.
// A deterministic 0-100 fit score for one job against the master profile.
// No AI call, so every job in the feed can be scored on arrival and the score
// is the same every time. Weights (fixed), after the career-ops rubric:
//   Hard skills    40  required JD skills found in the profile (30), plus
//                      "nice to have" / "preferred" matches (10)
//   Experience     20  years in the profile against the JD's years requirement
//   Location fit   20  strict: the job's work mode and city against the person's rules
//   Salary fit     20  the posted pay range against the person's expected CTC
// Whole-term matching follows the approach in Resume-Matcher's text_match.py
// (srbhr/Resume-Matcher, Apache-2.0): "java" must not match "javascript".

import { cityMatches, detectWorkMode, type WorkModeValue } from '../location';
import { parseSalaryLpa, salaryFromText } from '../salary';

export const GRILL_WEIGHTS = { skills: 40, experience: 20, location: 20, salary: 20 } as const;
const SKILLS_REQUIRED_SHARE = 0.75; // 30 of the 40 skill points; nice-to-haves carry the rest
export const GRILL_VERSION = 2;

export type GrillProfile = {
  skills: string[];
  yearsExperience: number | null;
  acceptRemote: boolean;
  acceptHybrid: boolean;
  onsiteCities: string[];
  // Free text of the whole profile (summary, bullets); used for nice-to-have evidence.
  text?: string;
  // Lowest acceptable pay, lakh rupees per annum.
  expectedSalaryLpa?: number | null;
};

export type GrillJob = {
  title: string;
  location: string | null;
  description: string | null;
  workMode?: WorkModeValue | null;
  salary?: string | null;
};

export type GrillBand = 'red' | 'yellow' | 'green';

export type GrillResult = {
  score: number;
  band: GrillBand;
  version: number;
  skills: {
    score: number; max: number; matched: string[]; missing: string[]; note?: string;
    nice: { matched: string[]; missing: string[]; source: 'nice_to_have' | 'none' };
  };
  experience: { score: number; max: number; requiredMin: number | null; requiredMax: number | null; have: number | null; reason: string };
  location: { score: number; max: number; workMode: WorkModeValue; reason: string };
  salary: { score: number; max: number; offeredMin: number | null; offeredMax: number | null; expected: number | null; reason: string };
  // Every JD skill missing from the profile, required ones first.
  missingKeywords: string[];
};

// Red < 50, Yellow 50-74, Green 75+.
export function grillBand(score: number): GrillBand {
  if (score < 50) return 'red';
  if (score < 75) return 'yellow';
  return 'green';
}

// ---- Skill vocabulary ----------------------------------------------------------
// Terms the Grill can recognise in a JD, on top of the person's own skills.
// Weighted toward talent acquisition, plus common tools and business skills.
export const SKILL_LEXICON = [
  // Recruiting core
  'recruiting', 'recruitment', 'talent acquisition', 'full cycle recruiting', 'end to end recruitment', 'sourcing',
  'headhunting', 'boolean search', 'x-ray search', 'candidate experience', 'employer branding', 'campus hiring',
  'university recruiting', 'lateral hiring', 'leadership hiring', 'executive search', 'tech hiring', 'technical recruiting',
  'non-tech hiring', 'gtm hiring', 'volume hiring', 'high volume recruiting', 'diversity hiring', 'dei',
  'stakeholder management', 'hiring manager management', 'intake meetings', 'offer negotiation', 'offer management',
  'compensation', 'salary benchmarking', 'market mapping', 'talent mapping', 'pipeline management', 'workforce planning',
  'headcount planning', 'interview scheduling', 'screening', 'assessment', 'onboarding', 'background verification',
  'referral program', 'vendor management', 'agency management', 'rpo', 'gcc', 'global capability center',
  'recruitment marketing', 'talent intelligence', 'talent analytics', 'recruiting metrics', 'time to fill',
  'time to hire', 'quality of hire', 'offer acceptance', 'cost per hire', 'hr business partnering', 'people operations',
  // Recruiting tools
  'linkedin recruiter', 'linkedin', 'naukri', 'indeed', 'greenhouse', 'lever', 'ashby', 'workday', 'successfactors',
  'smartrecruiters', 'icims', 'taleo', 'jobvite', 'darwinbox', 'keka', 'zoho recruit', 'bamboohr', 'gem', 'seekout',
  'hirequotient', 'hireez', 'beamery', 'eightfold', 'ats', 'hris', 'crm',
  // General tools and skills
  'excel', 'google sheets', 'power bi', 'tableau', 'sql', 'python', 'data analysis', 'reporting', 'dashboards',
  'project management', 'program management', 'communication', 'negotiation', 'presentation', 'consulting',
  'client management', 'account management', 'b2b', 'saas', 'fintech', 'it services', 'product companies', 'startup',
  'agile', 'jira', 'confluence', 'slack', 'notion', 'salesforce', 'hubspot',
  // Tech skills often named in tech-recruiting JDs
  'java', 'javascript', 'typescript', 'react', 'node.js', 'golang', 'aws', 'azure', 'gcp', 'devops', 'kubernetes',
  'data engineering', 'machine learning', 'ai', 'cloud', 'cybersecurity', 'sap', 'salesforce',
];

// Naming any of these counts as "ATS" experience.
const ATS_TOOLS = ['greenhouse', 'lever', 'ashby', 'workday', 'successfactors', 'smartrecruiters', 'icims', 'taleo', 'jobvite', 'darwinbox', 'zoho recruit', 'bamboohr'];

// Two spellings that mean the same skill. Keys and values are normalized terms.
const ALIASES: Record<string, string[]> = {
  'talent acquisition': ['ta'],
  recruiting: ['recruitment', 'hiring'],
  'full cycle recruiting': ['end to end recruitment', 'full life cycle recruiting', '360 recruitment', 'full-cycle recruiting'],
  sourcing: ['talent sourcing', 'candidate sourcing'],
  'boolean search': ['boolean'],
  'x-ray search': ['xray search', 'x ray search'],
  'linkedin recruiter': ['linkedin recruiter lite'],
  'stakeholder management': ['stakeholder engagement'],
  'leadership hiring': ['senior hiring', 'executive hiring'],
  'tech hiring': ['technical recruiting', 'technology hiring', 'technical hiring'],
  'campus hiring': ['university recruiting', 'campus recruitment'],
  gcc: ['global capability center', 'global capability centre', 'gic'],
  dei: ['diversity hiring', 'diversity equity and inclusion', 'd&i'],
  'time to fill': ['time-to-fill'],
  'time to hire': ['time-to-hire'],
  ats: ['applicant tracking system'],
  'google sheets': ['gsheets'],
  'power bi': ['powerbi'],
  'node.js': ['nodejs', 'node'],
  golang: ['go lang'],
};

export const normalizeTerm = (s: string) =>
  s.toLowerCase().replace(/[‐-―]/g, '-').replace(/[^a-z0-9+#.&\s-]/g, ' ').replace(/\s+/g, ' ').trim();

// Canonical form: every alias maps to its group key.
const CANON = new Map<string, string>();
for (const [key, alts] of Object.entries(ALIASES)) {
  CANON.set(normalizeTerm(key), normalizeTerm(key));
  for (const a of alts) CANON.set(normalizeTerm(a), normalizeTerm(key));
}
export const canonical = (term: string) => CANON.get(normalizeTerm(term)) ?? normalizeTerm(term);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reCache = new Map<string, RegExp>();
function termRegex(term: string) {
  let re = reCache.get(term);
  if (!re) {
    // Whole term: no letter or digit on either side. Spaces and hyphens interchange.
    const body = escape(term).replace(/\\-|\s+|-/g, '[\\s\\-]+');
    re = new RegExp(`(?<![a-z0-9+#])${body}(?![a-z0-9+#])`, 'i');
    reCache.set(term, re);
  }
  return re;
}

export function termInText(term: string, text: string) {
  const t = normalizeTerm(term);
  if (!t) return false;
  const forms = [t, ...(ALIASES[canonical(t)] ?? []).map(normalizeTerm), canonical(t)];
  return forms.some((f) => termRegex(f).test(text));
}

// Recognised skills in a text, de-duplicated by canonical form.
export function extractTerms(text: string, vocabulary: string[]): string[] {
  const lower = String(text || '').toLowerCase();
  const found = new Map<string, string>();
  for (const v of vocabulary) {
    const c = canonical(v);
    if (found.has(c)) continue;
    if (termInText(v, lower)) found.set(c, v);
  }
  return [...found.values()];
}

// ---- JD parsing ----------------------------------------------------------------------

const NICE_HEADING = /(nice[\s-]to[\s-]haves?|good[\s-]to[\s-]haves?|preferred( qualifications| skills| experience)?|bonus( points)?|pluses|desirable|desired skills|would be (great|nice|a plus)|extra credit|it'?s a plus)/i;
const OTHER_HEADING = /^(requirements|qualifications|minimum qualifications|basic qualifications|what you('ll)? (bring|need|do)|must[\s-]haves?|responsibilities|key responsibilities|about (you|us|the (role|team|company))|what we offer|benefits|perks|who you are|the role|your role|job description|skills required|required skills)\b/i;
const NICE_INLINE = /\b(is a plus|are a plus|a plus\b|nice to have|good to have|preferred|bonus|advantageous|desirable)\b/i;

export function splitJd(description: string) {
  const lines = String(description || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const required: string[] = [];
  const nice: string[] = [];
  let inNice = false;
  for (const line of lines) {
    const short = line.length <= 80;
    const headingText = line.replace(/^[#*•\-\s]+/, '').replace(/[:*\s]+$/, '');
    if (short && NICE_HEADING.test(headingText) && headingText.split(/\s+/).length <= 8) {
      inNice = true;
      continue;
    }
    if (short && OTHER_HEADING.test(headingText)) {
      inNice = false;
      required.push(line);
      continue;
    }
    if (inNice || NICE_INLINE.test(line)) nice.push(line);
    else required.push(line);
  }
  return { required: required.join('\n'), nice: nice.join('\n'), hasNiceSection: nice.length > 0 };
}

const YEARS_RE = /(?:(?:minimum|min\.?|at least|over)\s+(?:of\s+)?)?(\d{1,2})(?:\.\d)?\s*(?:\+|plus)?\s*(?:(?:-|–|—|to)\s*(\d{1,2})\s*\+?\s*)?(?:years?|yrs?)\b/gi;

// The years requirement, e.g. "5+ years", "3-6 yrs", "minimum of 8 years".
export function parseYearsRequirement(text: string): { min: number; max: number | null } | null {
  const src = String(text || '');
  let best: { min: number; max: number | null; near: boolean } | null = null;
  for (const m of src.matchAll(YEARS_RE)) {
    const min = Number(m[1]);
    const max = m[2] ? Number(m[2]) : null;
    if (!Number.isFinite(min) || min > 30 || (max !== null && (max < min || max > 40))) continue;
    const at = m.index ?? 0;
    const before = src.slice(Math.max(0, at - 30), at).toLowerCase();
    const after = src.slice(at + m[0].length, at + m[0].length + 60).toLowerCase();
    // "founded 20 years ago" or "a 30 years old company" is not a requirement.
    if (/^\s*(ago|old)\b/.test(after) || /\b(founded|history|since|over the (last|past))\b[^.]*$/.test(before)) continue;
    // Prefer mentions near "experience".
    const near = /experience|exp\b|background|recruit|hiring|talent|industry/.test(`${before} ${after}`);
    if (!best || (near && !best.near)) best = { min, max, near };
    if (best.near) break;
  }
  return best ? { min: best.min, max: best.max } : null;
}

// ---- Scoring ---------------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;

function scoreSkills(profile: GrillProfile, split: ReturnType<typeof splitJd>, title: string, fullJd: string): GrillResult['skills'] {
  const max = GRILL_WEIGHTS.skills;
  const vocab = [...SKILL_LEXICON, ...profile.skills];
  const evidence = `${profile.skills.join('\n')}\n${profile.text || ''}`.toLowerCase();
  const anyAts = ATS_TOOLS.some((a) => termInText(a, evidence));
  const has = (t: string) => (canonical(t) === 'ats' && anyAts)
    || profile.skills.some((s) => canonical(s) === canonical(t) || termInText(t, s.toLowerCase())) || termInText(t, evidence);
  const reqTerms = extractTerms(split.required ? `${title}\n${split.required}` : fullJd, vocab);
  const niceTerms = split.hasNiceSection ? extractTerms(split.nice, vocab).filter((t) => !reqTerms.some((r) => canonical(r) === canonical(t))) : [];
  const matched = reqTerms.filter(has);
  const missing = reqTerms.filter((t) => !matched.includes(t));
  const niceMatched = niceTerms.filter(has);
  const nice = { matched: niceMatched, missing: niceTerms.filter((t) => !niceMatched.includes(t)), source: split.hasNiceSection ? 'nice_to_have' as const : 'none' as const };
  if (!profile.skills.length) return { score: 0, max, matched: [], missing, nice, note: 'Add skills to your profile.' };
  if (!reqTerms.length && !niceTerms.length) return { score: max / 2, max, matched: [], missing: [], nice, note: 'The JD names no skills the Grill recognises; scored neutral.' };
  const reqRatio = reqTerms.length ? matched.length / reqTerms.length : 0.5;
  // Without a nice-to-have list the required ratio carries all 40 points.
  const niceRatio = niceTerms.length ? niceMatched.length / niceTerms.length : reqRatio;
  return { score: round1(max * (SKILLS_REQUIRED_SHARE * reqRatio + (1 - SKILLS_REQUIRED_SHARE) * niceRatio)), max, matched, missing, nice };
}

function scoreLocation(profile: GrillProfile, job: GrillJob) {
  const max = GRILL_WEIGHTS.location;
  const workMode = job.workMode && job.workMode !== 'UNKNOWN' ? job.workMode : detectWorkMode(job.location, job.description);
  const loc = job.location || '';
  const inCity = cityMatches(loc, profile.onsiteCities);
  const cities = profile.onsiteCities.join(', ') || 'no cities';
  if (workMode === 'REMOTE') {
    if (!profile.acceptRemote) return { score: 0, max, workMode, reason: 'Remote role, but your profile says no remote.' };
    // A remote role locked to another country is not remote for someone in India.
    const lower = loc.toLowerCase();
    const restricted = /\b(us|usa|united states|canada|uk|united kingdom|europe|emea|eu|latam|americas|australia|germany|france|spain|brazil|mexico)\b/.test(lower)
      && !/\b(india|apac|asia|anywhere|worldwide|global)\b/.test(lower);
    if (restricted) return { score: 0, max, workMode, reason: `Remote, but limited to ${loc}.` };
    return { score: max, max, workMode, reason: 'Remote role and you accept remote.' };
  }
  if (workMode === 'HYBRID') {
    if (!profile.acceptHybrid) return { score: 0, max, workMode, reason: 'Hybrid role, but your profile says no hybrid.' };
    return inCity
      ? { score: max, max, workMode, reason: `Hybrid in ${loc}, one of your cities.` }
      : { score: 0, max, workMode, reason: `Hybrid in ${loc || 'an unlisted city'}; your cities: ${cities}.` };
  }
  if (workMode === 'ONSITE') {
    return inCity
      ? { score: max, max, workMode, reason: `On-site in ${loc}, one of your cities.` }
      : { score: 0, max, workMode, reason: `On-site in ${loc || 'an unlisted city'}; your cities: ${cities}.` };
  }
  return { score: max / 2, max, workMode, reason: 'The posting does not say where the job is; scored half.' };
}

function scoreExperience(profile: GrillProfile, required: string, fullJd: string) {
  const max = GRILL_WEIGHTS.experience;
  const req = parseYearsRequirement(required) ?? parseYearsRequirement(fullJd);
  const have = profile.yearsExperience;
  if (!req) return { score: max, max, requiredMin: null, requiredMax: null, have, reason: 'No years requirement in the JD.' };
  const base = { max, requiredMin: req.min, requiredMax: req.max, have };
  if (have === null || have === undefined) return { ...base, score: max / 2, reason: 'Add your years of experience to your profile.' };
  if (have >= req.min) {
    if (req.max !== null && have > req.max + 3) {
      return { ...base, score: round1(max * 0.75), reason: `You have ${have} years; the band is ${req.min}-${req.max}, so you may read as over-levelled.` };
    }
    return { ...base, score: max, reason: `You have ${have} years; the JD asks for ${req.min}${req.max ? `-${req.max}` : '+'}.` };
  }
  // Linear credit below the minimum, zero at half the minimum or less.
  const ratio = Math.max(0, (have - req.min / 2) / (req.min / 2));
  return { ...base, score: round1(max * ratio), reason: `You have ${have} years; the JD asks for at least ${req.min}.` };
}

function scoreSalary(profile: GrillProfile, job: GrillJob): GrillResult['salary'] {
  const max = GRILL_WEIGHTS.salary;
  const expected = profile.expectedSalaryLpa && profile.expectedSalaryLpa > 0 ? profile.expectedSalaryLpa : null;
  const offered = parseSalaryLpa(job.salary) ?? parseSalaryLpa(salaryFromText(job.description));
  const base = { max, expected, offeredMin: offered?.min ?? null, offeredMax: offered?.max ?? null };
  if (!offered) return { ...base, score: max / 2, reason: 'The posting does not state pay; scored half.' };
  const range = `${offered.min === offered.max ? offered.min : `${offered.min}-${offered.max}`} LPA${offered.approx ? ' (converted, approx.)' : ''}`;
  if (!expected) return { ...base, score: max / 2, reason: `Pays ${range}. Add your expected CTC to your profile to score this.` };
  if (offered.max >= expected) return { ...base, score: max, reason: `Pays ${range}; you want ${expected} LPA or more.` };
  if (offered.max >= expected * 0.85) return { ...base, score: max / 2, reason: `Pays up to ${offered.max} LPA, a little under your ${expected} LPA.` };
  return { ...base, score: 0, reason: `Pays up to ${offered.max} LPA, well under your ${expected} LPA.` };
}

export function grill(profile: GrillProfile, job: GrillJob): GrillResult {
  const fullJd = `${job.title}\n${job.description || ''}`;
  const split = splitJd(job.description || '');
  const skills = scoreSkills(profile, split, job.title, fullJd);
  const experience = scoreExperience(profile, split.required, fullJd);
  const location = scoreLocation(profile, job);
  const salary = scoreSalary(profile, job);
  const score = Math.max(0, Math.min(100, Math.round(skills.score + experience.score + location.score + salary.score)));
  const missingKeywords = [...new Set([...skills.missing, ...skills.nice.missing])];
  return { score, band: grillBand(score), version: GRILL_VERSION, skills, experience, location, salary, missingKeywords };
}

// Total years from experience entries such as { start: "Jan 2018", end: "Present" }.
export function yearsFromExperience(items: { start?: string; end?: string }[], now = new Date()): number | null {
  let earliest: number | null = null;
  for (const e of items) {
    const y = String(e.start || '').match(/(19|20)\d{2}/);
    if (y) earliest = Math.min(earliest ?? Infinity, Number(y[0]));
  }
  return earliest ? Math.max(0, now.getFullYear() - earliest) : null;
}
