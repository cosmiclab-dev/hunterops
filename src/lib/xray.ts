// Google X-Ray and LinkedIn search builders for the Discover tab.
// These only open a normal search in the person's own browser; nothing is scraped.

export const ROLE_PRESETS = [
  'Senior Recruiter',
  'Talent Acquisition Partner',
  'Talent Acquisition Specialist',
  'Technical Recruiter',
  'Lead Recruiter',
  'Talent Acquisition Lead',
] as const;

export const LOCATION_PRESETS = {
  bengaluru: { label: 'Bengaluru', terms: ['"Bengaluru"', '"Bangalore"'] },
  india: { label: 'India', terms: ['"India"'] },
  remote: { label: 'Remote', terms: ['"Remote"'] },
} as const;
export type LocationKey = keyof typeof LOCATION_PRESETS;

export const WINDOWS = {
  d: { label: '24 hours', tbs: 'qdr:d', linkedin: 'past-24h' },
  d2: { label: '48 hours', tbs: 'qdr:h48', linkedin: 'past-24h' },
  w: { label: 'Week', tbs: 'qdr:w', linkedin: 'past-week' },
} as const;
export type WindowKey = keyof typeof WINDOWS;

export const ATS_TARGETS = [
  { id: 'greenhouse', name: 'Greenhouse', site: 'site:boards.greenhouse.io OR site:job-boards.greenhouse.io', note: 'Tech and product companies' },
  { id: 'ashby', name: 'Ashby', site: 'site:jobs.ashbyhq.com', note: 'High-growth startups' },
  { id: 'lever', name: 'Lever', site: 'site:jobs.lever.co', note: 'Mid-size tech' },
  { id: 'smartrecruiters', name: 'SmartRecruiters', site: 'site:jobs.smartrecruiters.com', note: 'Enterprises and GCCs' },
  { id: 'workday', name: 'Workday', site: 'site:myworkdayjobs.com', note: 'Large enterprises and GCCs' },
] as const;

export type XrayInput = { roles: string[]; locations: LocationKey[]; window: WindowKey; extra?: string };

const quote = (s: string) => `"${s.replace(/"/g, '').trim()}"`;
const orGroup = (terms: string[]) => (terms.length === 1 ? terms[0] : `(${terms.join(' OR ')})`);

export function roleGroup(roles: string[]) {
  const list = roles.map((r) => r.trim()).filter(Boolean);
  return orGroup((list.length ? list : ['Senior Recruiter']).map(quote));
}

export function locationGroup(locations: LocationKey[]) {
  const terms = (locations.length ? locations : (['bengaluru', 'remote'] as LocationKey[])).flatMap((l) => LOCATION_PRESETS[l].terms);
  return orGroup(Array.from(new Set(terms)));
}

export function googleUrl(query: string, window: WindowKey) {
  const p = new URLSearchParams({ q: query, tbs: WINDOWS[window].tbs });
  return `https://www.google.com/search?${p.toString()}`;
}

export function atsQuery(site: string, input: XrayInput) {
  const sites = site.includes(' OR ') ? `(${site})` : site;
  return [sites, roleGroup(input.roles), locationGroup(input.locations), input.extra?.trim()].filter(Boolean).join(' ');
}

export function atsSearches(input: XrayInput) {
  return ATS_TARGETS.map((t) => {
    const query = atsQuery(t.site, input);
    return { ...t, query, url: googleUrl(query, input.window) };
  });
}

// Hiring-manager and TA-leader finders.
export function peopleSearches(input: XrayInput) {
  const loc = locationGroup(input.locations);
  const hiringPhrases = '("hiring a senior recruiter" OR "hiring recruiters" OR "we are hiring" OR "growing our talent team" OR "scaling our TA team")';
  const leaders = '("Head of Talent Acquisition" OR "Director Talent Acquisition" OR "TA Lead" OR "Talent Acquisition Manager")';
  const gcc = '("GCC" OR "Global Capability Center" OR "Global Capability Centre" OR "Global In-house Center")';
  const posts = [hiringPhrases, roleGroup(input.roles), loc].join(' ');
  const out = [
    {
      id: 'li-posts-google',
      name: 'Hiring posts (Google)',
      note: 'LinkedIn posts from TA leaders saying they are hiring',
      query: `site:linkedin.com/posts ${posts}`,
      url: googleUrl(`site:linkedin.com/posts ${posts}`, input.window === 'd' ? 'w' : input.window),
    },
    {
      id: 'li-posts',
      name: 'Hiring posts (LinkedIn)',
      note: 'Opens LinkedIn post search; you need to be signed in',
      query: `${hiringPhrases} ${loc}`,
      url: `https://www.linkedin.com/search/results/content/?${new URLSearchParams({ keywords: `${hiringPhrases} ${loc}`, datePosted: `"${WINDOWS[input.window].linkedin}"`, sortBy: '"date_posted"' }).toString()}`,
    },
    {
      id: 'ta-leaders',
      name: 'TA leaders',
      note: 'Heads and directors of Talent Acquisition near you',
      query: `site:linkedin.com/in ${leaders} ${loc}`,
      url: googleUrl(`site:linkedin.com/in ${leaders} ${loc}`, 'w'),
    },
    {
      id: 'gcc-ta',
      name: 'GCC TA leads',
      note: 'Talent leaders at Global Capability Centers',
      query: `site:linkedin.com/in ${leaders} ${gcc} ${loc}`,
      url: googleUrl(`site:linkedin.com/in ${leaders} ${gcc} ${loc}`, 'w'),
    },
  ];
  return out;
}
