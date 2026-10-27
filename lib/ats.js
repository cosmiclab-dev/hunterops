// ATS detection from a job posting URL. Mirrored in public/js/ats.js for the UI.
export const ATS_TYPES = [
  'greenhouse', 'ashby', 'lever', 'smartrecruiters', 'workday', 'successfactors', 'darwinbox',
  'keka', 'zoho', 'recruitee', 'workable', 'linkedin', 'naukri', 'indeed', 'other',
];

const RULES = [
  [/(^|\.)greenhouse\.io$/, 'greenhouse'],
  [/(^|\.)ashbyhq\.com$/, 'ashby'],
  [/(^|\.)lever\.co$/, 'lever'],
  [/(^|\.)smartrecruiters\.com$/, 'smartrecruiters'],
  [/(^|\.)myworkdayjobs\.com$|(^|\.)myworkdaysite\.com$|(^|\.)workday\.com$/, 'workday'],
  [/(^|\.)successfactors\.(com|eu)$|(^|\.)sapsf\.(com|eu)$/, 'successfactors'],
  [/(^|\.)darwinbox\.(in|com|io)$/, 'darwinbox'],
  [/(^|\.)keka\.com$/, 'keka'],
  [/(^|\.)zohorecruit\.(in|com|eu)$/, 'zoho'],
  [/(^|\.)recruitee\.com$/, 'recruitee'],
  [/(^|\.)workable\.com$/, 'workable'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)naukri\.com$/, 'naukri'],
  [/(^|\.)indeed\.(com|co\.in)$/, 'indeed'],
];

export function detectAts(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  for (const [re, type] of RULES) if (re.test(host)) return type;
  return 'other';
}
