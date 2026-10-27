// Module D: The Grill.
// A deterministic 0-100 fit score for one job against the master profile.
// No AI call, so every job in the feed can be scored on arrival and the score
// is the same every time. Weights (fixed):
//   Skills match   40  overlap between Profile skills and the JD's required skills
//   Location fit   20  strict: the job's work mode and city against the person's rules
//   Experience     20  years in the profile against the JD's years requirement
//   Keywords       20  bonus for "nice to have" / "preferred" matches
// Whole-term matching follows the approach in Resume-Matcher's text_match.py
// (srbhr/Resume-Matcher, Apache-2.0): "java" must not match "javascript".

import { cityMatches, detectWorkMode, type WorkModeValue } from '../location';

export const GRILL_WEIGHTS = { skills: 40, location: 20, experience: 20, keywords: 20 } as const;
export const GRILL_VERSION = 1;

export type GrillProfile = {
  skills: string[];
  yearsExperience: number | null;
  acceptRemote: boolean;
  acceptHybrid: boolean;
  onsiteCities: string[];
  // Free text of the whole profile (summary, bullets); used for nice-to-have evidence.
  text?: string;
};

export type GrillJob = {
  title: string;
  location: string | null;
  description: string | null;
  workMode?: WorkModeValue | null;
};

export type GrillBand = 'red' | 'yellow' | 'green';

export type GrillResult = {
  score: number;
  band: GrillBand;
  version: number;
  skills: { score: number; max: number; matched: string[]; missing: string[]; note?: string };
  location: { score: number; max: number; workMode: WorkModeValue; reason: string };
  experience: { score: number; max: number; requiredMin: number | null; requiredMax: number | null; have: number | null; reason: string };
  keywords: { score: number; max: number; matched: string[]; missing: string[]; source: 'nice_to_have' | 'whole_jd' };
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

function scoreSkills(profile: GrillProfile, required: string, fullJd: string) {
  const max = GRILL_WEIGHTS.skills;
  const vocab = [...SKILL_LEXICON, ...profile.skills];
  const jdTerms = extractTerms(required || fullJd, vocab);
  const profileCanon = new Set(profile.skills.map(canonical));
  const matched = jdTerms.filter((t) => profileCanon.has(canonical(t)) || profile.skills.some((s) => termInText(t, s.toLowerCase())));
  const missing = jdTerms.filter((t) => !matched.includes(t));
  if (!profile.skills.length) return { score: 0, max, matched: [], missing, note: 'Add skills to your profile.' };
  if (!jdTerms.length) return { score: max / 2, max, matched: [], missing: [], note: 'The JD names no skills the Grill recognises; scored neutral.' };
  return { score: round1((max * matched.length) / jdTerms.length), max, matched, missing };
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

function scoreKeywords(profile: GrillProfile, split: ReturnType<typeof splitJd>, fullJd: string) {
  const max = GRILL_WEIGHTS.keywords;
  const vocab = [...SKILL_LEXICON, ...profile.skills];
  const source = split.hasNiceSection ? 'nice_to_have' as const : 'whole_jd' as const;
  const terms = extractTerms(split.hasNiceSection ? split.nice : fullJd, vocab);
  const evidence = `${profile.skills.join('\n')}\n${profile.text || ''}`.toLowerCase();
  const matched = terms.filter((t) => termInText(t, evidence));
  const missing = terms.filter((t) => !matched.includes(t));
  if (!terms.length) return { score: split.hasNiceSection ? max / 2 : 0, max, matched, missing, source };
  return { score: round1((max * matched.length) / terms.length), max, matched, missing, source };
}

export function grill(profile: GrillProfile, job: GrillJob): GrillResult {
  const fullJd = `${job.title}\n${job.description || ''}`;
  const split = splitJd(job.description || '');
  const skills = scoreSkills(profile, split.required ? `${job.title}\n${split.required}` : '', fullJd);
  const location = scoreLocation(profile, job);
  const experience = scoreExperience(profile, split.required, fullJd);
  const keywords = scoreKeywords(profile, split, fullJd);
  const score = Math.max(0, Math.min(100, Math.round(skills.score + location.score + experience.score + keywords.score)));
  return { score, band: grillBand(score), version: GRILL_VERSION, skills, location, experience, keywords };
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
