// Location parsing shared by the scanner (feed filter) and the Grill (strict fit).
export const LOCATION_CLASSES = ['bengaluru', 'remote_india', 'remote_global', 'india', 'remote_other', 'other'] as const;
export type LocationClass = (typeof LOCATION_CLASSES)[number];

const BLR_RE = /\b(bengaluru|bangalore|blr)\b/;
const REMOTE_RE = /\b(remote|anywhere|work from home|wfh|distributed|fully remote)\b/;
const HYBRID_RE = /\bhybrid\b/;
const INDIA_RE = /\b(india|indian|mumbai|delhi|ncr|gurgaon|gurugram|noida|hyderabad|pune|chennai|kolkata|ahmedabad|kochi|jaipur|chandigarh|coimbatore|ist)\b/;
const APAC_RE = /\b(apac|asia|asia pacific|south asia)\b/;
const GLOBAL_RE = /\b(anywhere|worldwide|global|international|any location)\b/;

export function classifyLocation(location: string | null | undefined, remoteFlag = false): LocationClass {
  const text = String(location || '').toLowerCase();
  if (BLR_RE.test(text)) return 'bengaluru';
  const remote = remoteFlag || REMOTE_RE.test(text);
  const india = INDIA_RE.test(text);
  if (remote) {
    if (india || APAC_RE.test(text)) return 'remote_india';
    const rest = text.replace(new RegExp(REMOTE_RE.source, 'g'), ' ').replace(/[^a-z]+/g, ' ').trim();
    if (!rest || GLOBAL_RE.test(text)) return 'remote_global';
    return 'remote_other';
  }
  return india ? 'india' : 'other';
}

export type WorkModeValue = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN';

// Reads the work arrangement from the location line first, then the JD text.
export function detectWorkMode(location: string | null | undefined, description?: string | null, remoteFlag = false): WorkModeValue {
  const loc = String(location || '').toLowerCase();
  if (HYBRID_RE.test(loc)) return 'HYBRID';
  if (remoteFlag || REMOTE_RE.test(loc)) return 'REMOTE';
  const jd = String(description || '').toLowerCase().slice(0, 6000);
  if (/\bhybrid\b/.test(jd)) return 'HYBRID';
  if (/\b(fully remote|100% remote|remote[- ]first|work from anywhere|this (role|position) is remote)\b/.test(jd)) return 'REMOTE';
  if (/\b(on[- ]?site|in[- ]office|work from (the )?office|wfo|5 days (a week )?(in|from) (the )?office)\b/.test(jd)) return 'ONSITE';
  if (loc.trim()) return 'ONSITE';
  return 'UNKNOWN';
}

// Every city name in the location string that matches one of the person's cities.
const CITY_ALIASES: Record<string, string[]> = {
  bengaluru: ['bengaluru', 'bangalore', 'blr'],
  mumbai: ['mumbai', 'bombay'],
  gurugram: ['gurugram', 'gurgaon'],
  delhi: ['delhi', 'new delhi', 'ncr'],
  chennai: ['chennai', 'madras'],
};

export function cityMatches(location: string | null | undefined, cities: string[]) {
  const loc = ` ${String(location || '').toLowerCase().replace(/[^a-z]+/g, ' ')} `;
  return cities.some((c) => {
    const key = c.toLowerCase().trim();
    const names = CITY_ALIASES[key] ?? Object.values(CITY_ALIASES).find((a) => a.includes(key)) ?? [key];
    return names.some((n) => loc.includes(` ${n} `));
  });
}
