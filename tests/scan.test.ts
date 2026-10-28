import { describe, expect, it } from 'vitest';
import { classifyLocation, detectWorkMode } from '@/lib/location';
import { filterPostings, titleMatcher } from '@/lib/scan/scanner';
import { parseCareersUrl, workdayPostedOn } from '@/lib/scan/sources';

const prefs = { keywords: ['recruiter', 'talent acquisition'], exclude: ['intern'], locations: ['bengaluru', 'remote_india', 'remote_global'] as any, searchTerms: ['recruiter'] };

describe('scanner', () => {
  it('classifies locations', () => {
    expect(classifyLocation('Bangalore, Karnataka')).toBe('bengaluru');
    expect(classifyLocation('Remote - India')).toBe('remote_india');
    expect(classifyLocation('Remote')).toBe('remote_global');
    expect(classifyLocation('Remote, US')).toBe('remote_other');
    expect(classifyLocation('Hyderabad')).toBe('india');
    expect(classifyLocation('London')).toBe('other');
  });

  it('detects work mode', () => {
    expect(detectWorkMode('Bengaluru (Hybrid)')).toBe('HYBRID');
    expect(detectWorkMode('Remote')).toBe('REMOTE');
    expect(detectWorkMode('Bengaluru', 'This is a fully remote role')).toBe('REMOTE');
    expect(detectWorkMode('Bengaluru', 'Work from office 5 days')).toBe('ONSITE');
    expect(detectWorkMode('', '')).toBe('UNKNOWN');
  });

  it('matches titles with plurals and exclusions', () => {
    const m = titleMatcher(prefs.keywords, prefs.exclude);
    expect(m('Senior Technical Recruiter')).toBe(true);
    expect(m('Recruiters Pool')).toBe(true);
    expect(m('Recruiter Intern')).toBe(false);
    expect(m('Software Engineer')).toBe(false);
  });

  it('filters postings by title, place and age', () => {
    const now = Date.parse('2026-10-27T00:00:00Z');
    const base = { source: 'x', source_id: '1', company: 'A', remote: false, description: null, salary: null, posted_at: '2026-10-20T00:00:00Z' };
    const out = filterPostings([
      { ...base, title: 'Recruiter', location: 'Bengaluru', url: 'https://a/1' },
      { ...base, title: 'Recruiter', location: 'New York', url: 'https://a/2' },
      { ...base, title: 'Engineer', location: 'Bengaluru', url: 'https://a/3' },
      { ...base, title: 'Recruiter', location: 'Remote', url: 'https://a/4', posted_at: '2026-01-01T00:00:00Z' },
      { ...base, title: 'Recruiter', location: 'Remote', url: 'ftp://bad' },
    ], prefs, now);
    expect(out.map((p) => p.url)).toEqual(['https://a/1']);
  });

  it('parses careers URLs for every ATS', () => {
    expect(parseCareersUrl('https://boards.greenhouse.io/figma/jobs/123')).toMatchObject({ ats_type: 'greenhouse', ats_slug: 'figma' });
    expect(parseCareersUrl('https://jobs.lever.co/meesho')).toMatchObject({ ats_type: 'lever', ats_slug: 'meesho' });
    expect(parseCareersUrl('https://jobs.ashbyhq.com/rogo')).toMatchObject({ ats_type: 'ashby', ats_slug: 'rogo' });
    expect(parseCareersUrl('https://autodesk.wd1.myworkdayjobs.com/en-US/Ext/job/x')).toMatchObject({ ats_type: 'workday', ats_slug: 'autodesk.wd1.myworkdayjobs.com|Ext' });
    expect(parseCareersUrl('https://apply.workable.com/acme/')).toMatchObject({ ats_type: 'workable', ats_slug: 'acme' });
    expect(parseCareersUrl('not a url')).toBeNull();
  });

  it('reads Workday posted dates', () => {
    const now = Date.parse('2026-10-27T00:00:00Z');
    expect(workdayPostedOn('Posted Today', now)).toBe('2026-10-27T00:00:00.000Z');
    expect(workdayPostedOn('Posted 3 Days Ago', now)).toBe('2026-10-24T00:00:00.000Z');
  });
});

describe('title matcher stems', () => {
  it('finds Recruiting and Sourcing titles from the default keywords', () => {
    const m = titleMatcher(['recruiter', 'sourcer', 'talent acquisition'], ['intern']);
    for (const t of ['Recruiting Coordinator', 'Technical Recruiting Lead', 'Sourcing Specialist', 'Senior Recruiter']) expect(m(t), t).toBe(true);
    expect(m('Recruiting Intern')).toBe(false);
    expect(m('Software Engineer')).toBe(false);
  });
});
