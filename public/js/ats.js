// ATS metadata for the UI. Detection mirrors netlify/lib/ats.js.
export const ATS = {
  greenhouse: 'Greenhouse',
  ashby: 'Ashby',
  lever: 'Lever',
  smartrecruiters: 'SmartRecruiters',
  workday: 'Workday',
  successfactors: 'SuccessFactors',
  darwinbox: 'Darwinbox',
  keka: 'Keka',
  zoho: 'Zoho Recruit',
  other: 'Other',
};

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
];

export function detectAts(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [re, type] of RULES) if (re.test(host)) return type;
  return 'other';
}

// Best-effort company guess from common ATS URL shapes, e.g.
// jobs.lever.co/<company>/..., boards.greenhouse.io/<company>/..., <company>.wd3.myworkdayjobs.com
export function guessCompany(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  const host = u.hostname.toLowerCase();
  const first = u.pathname.split('/').filter(Boolean)[0] || '';
  let slug = '';
  if (/greenhouse\.io$|lever\.co$|ashbyhq\.com$|smartrecruiters\.com$/.test(host)) slug = first;
  else if (/myworkdayjobs\.com$|darwinbox\.|keka\.com$|zohorecruit\./.test(host)) slug = host.split('.')[0];
  if (!slug || ['embed', 'jobs', 'careers', 'www'].includes(slug)) return '';
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
