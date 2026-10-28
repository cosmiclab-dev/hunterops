import { afterEach, describe, expect, it, vi } from 'vitest';
import { formFields } from '../src/lib/html';
import { isAggregatorUrl, titleOverlap } from '../src/lib/original-posting';
import { workdayDescription } from '../src/lib/scan/sources';

describe('application forms', () => {
  it('ignores a site country picker that is not an application form', () => {
    // What the app read from an Adzuna listing instead of the employer's form.
    const html = '<header><select id="country-selector" name="country-selector"><option>India</option><option>Canada</option></select></header><main><p>Senior Recruiter</p></main>';
    expect(formFields(html)).toEqual([]);
  });
  it('keeps a real application form', () => {
    const html = '<form><label for="e">Email</label><input id="e" name="email"><label for="cv">Resume</label><input id="cv" name="resume" type="file"></form>';
    expect(formFields(html).map((f) => f.key)).toEqual(['email', 'resume']);
  });
});

describe('job board listings', () => {
  it('knows which links are job boards rather than employers', () => {
    expect(isAggregatorUrl('https://www.adzuna.in/details/5943994189?utm_medium=api')).toBe(true);
    expect(isAggregatorUrl('https://in.indeed.com/viewjob?jk=1')).toBe(true);
    expect(isAggregatorUrl('https://job-boards.greenhouse.io/gitlab/jobs/1')).toBe(false);
  });
  it('matches the same role across sites, not a different one', () => {
    expect(titleOverlap('Senior Talent Acquisition Partner', 'Senior Talent Acquisition Partner')).toBe(1);
    expect(titleOverlap('Senior Talent Acquisition Partner', 'Senior Talent Acquisition Partner - Bengaluru')).toBeGreaterThanOrEqual(0.75);
    expect(titleOverlap('Senior Talent Acquisition Partner', 'Talent Acquisition Specialist')).toBeLessThan(0.6);
  });
});

describe('Workday descriptions', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reads the description from the posting detail call', async () => {
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify({ jobPostingInfo: { jobDescription: '<p>Source engineers.</p><ul><li>Boolean search</li></ul>' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const text = await workdayDescription('https://paypal.wd1.myworkdayjobs.com/jobs/job/Bangalore-Karnataka-India/Sr-Recruiter_R0138298');
    expect(fetch.mock.calls[0][0]).toBe('https://paypal.wd1.myworkdayjobs.com/wday/cxs/paypal/jobs/job/Bangalore-Karnataka-India/Sr-Recruiter_R0138298');
    expect(text).toMatch(/Source engineers/);
    expect(text).toMatch(/Boolean search/);
  });
});
