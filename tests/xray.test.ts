import { describe, expect, it } from 'vitest';
import { atsSearches, googleUrl, locationGroup, peopleSearches, roleGroup } from '@/lib/xray';

describe('X-Ray builder', () => {
  const input = { roles: ['Senior Recruiter', 'Talent Acquisition Partner'], locations: ['bengaluru', 'remote'] as const, window: 'd' as const };

  it('builds one search per ATS with the 24-hour filter', () => {
    const s = atsSearches({ ...input, locations: [...input.locations] });
    expect(s.map((x) => x.id)).toEqual(['greenhouse', 'ashby', 'lever', 'smartrecruiters', 'workday']);
    const gh = new URL(s[0].url);
    expect(gh.searchParams.get('tbs')).toBe('qdr:d');
    expect(gh.searchParams.get('q')).toBe('(site:boards.greenhouse.io OR site:job-boards.greenhouse.io) ("Senior Recruiter" OR "Talent Acquisition Partner") ("Bengaluru" OR "Bangalore" OR "Remote")');
    expect(new URL(s[1].url).searchParams.get('q')).toMatch(/^site:jobs\.ashbyhq\.com /);
  });

  it('falls back to sensible defaults and strips stray quotes', () => {
    expect(roleGroup([])).toBe('"Senior Recruiter"');
    expect(roleGroup(['TA "Lead"'])).toBe('"TA Lead"');
    expect(locationGroup([])).toBe('("Bengaluru" OR "Bangalore" OR "Remote")');
    expect(googleUrl('x', 'w')).toBe('https://www.google.com/search?q=x&tbs=qdr%3Aw');
  });

  it('builds hiring-manager finders', () => {
    const p = peopleSearches({ ...input, locations: [...input.locations] });
    expect(p).toHaveLength(4);
    expect(p[0].query).toMatch(/^site:linkedin\.com\/posts /);
    expect(p[1].url).toMatch(/^https:\/\/www\.linkedin\.com\/search\/results\/content\/\?/);
    expect(p[3].query).toMatch(/Global Capability Center/);
  });
});
