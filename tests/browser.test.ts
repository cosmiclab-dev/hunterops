import { describe, expect, it } from 'vitest';
import { frameAllowed, isPrivateIp, parsePublicUrl } from '@/lib/net';
import { formFields, jobPostingFromHtml, sanitizeHtml } from '@/lib/html';
import { atsRef } from '@/lib/job-page';

describe('in-app Browser: fetching safely', () => {
  it('refuses private and loopback addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.5', '172.20.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '104.18.1.1', '2606:4700::1111']) expect(isPrivateIp(ip), ip).toBe(false);
  });

  it('accepts only plain http(s) links', () => {
    expect(parsePublicUrl('https://jobs.lever.co/acme/1').hostname).toBe('jobs.lever.co');
    expect(() => parsePublicUrl('javascript:alert(1)')).toThrow(/http and https/);
    expect(() => parsePublicUrl('file:///etc/passwd')).toThrow(/http and https/);
    expect(() => parsePublicUrl('https://user:pw@example.com')).toThrow(/username/);
    expect(() => parsePublicUrl('not a url')).toThrow(/valid link/);
  });

  it('reads whether a site allows framing', () => {
    expect(frameAllowed(new Headers())).toBe(true);
    expect(frameAllowed(new Headers({ 'x-frame-options': 'DENY' }))).toBe(false);
    expect(frameAllowed(new Headers({ 'x-frame-options': 'SAMEORIGIN' }))).toBe(false);
    expect(frameAllowed(new Headers({ 'content-security-policy': "default-src 'self'; frame-ancestors 'self'" }))).toBe(false);
    expect(frameAllowed(new Headers({ 'content-security-policy': 'frame-ancestors *' }))).toBe(true);
  });
});

describe('in-app Browser: reader view', () => {
  it('strips scripts, handlers, styles and unsafe links', () => {
    const out = sanitizeHtml(`<div onclick="steal()"><h2 style="color:red">Role</h2><script>alert(1)</script><p>Hire <b>fast</b></p>
      <a href="javascript:alert(1)">bad</a><a href="/apply">Apply</a><iframe src="https://x"></iframe><img src=x onerror=alert(1)><form><input name=q></form></div>`, 'https://jobs.example.com/role/1');
    expect(out).not.toMatch(/script|onclick|onerror|style=|javascript:|iframe|<img|<form|<input/i);
    expect(out).toContain('<h2>Role</h2>');
    expect(out).toContain('<b>fast</b>');
    expect(out).toContain('href="https://jobs.example.com/apply" target="_blank" rel="noopener noreferrer"');
    expect(out).toContain('<span>bad</span>');
  });

  it('escapes text so markup in text cannot run', () => {
    expect(sanitizeHtml('<p>&lt;script&gt;x&lt;/script&gt;</p>')).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>');
  });

  it('reads schema.org JobPosting data', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Senior Recruiter', datePosted: '2026-10-26',
      description: '<p>Own tech hiring.</p><ul><li>5+ years</li></ul>', hiringOrganization: { name: 'Acme' },
      jobLocation: { address: { addressLocality: 'Bengaluru', addressCountry: 'IN' } },
      baseSalary: { currency: 'INR', value: { minValue: 2000000, maxValue: 2800000, unitText: 'YEAR' } },
    })}</script></head><body></body></html>`;
    const j = jobPostingFromHtml(html)!;
    expect(j).toMatchObject({ title: 'Senior Recruiter', company: 'Acme', location: 'Bengaluru, IN', postedAt: '2026-10-26' });
    expect(j.description).toContain('Own tech hiring');
    expect(j.salary).toBe('INR 2000000 – 2800000 per year');
  });

  it('finds the fields of an application form', () => {
    const fields = formFields(`<form>
      <label for="fn">First name *</label><input id="fn" name="first_name" required>
      <label for="em">Email</label><input id="em" name="email" type="email">
      <label>LinkedIn profile <input name="urls[LinkedIn]" type="url"></label>
      <label for="why">Why do you want to join us?</label><textarea id="why" name="why"></textarea>
      <label for="np">Notice period</label><select id="np" name="notice"><option>Select…</option><option>Immediate</option><option>30 days</option></select>
      <input type="hidden" name="csrf" value="x"><input type="submit" value="Apply">
      <input name="g-recaptcha-response">
    </form>`);
    expect(fields.map((f) => f.key)).toEqual(['first_name', 'email', 'urls[LinkedIn]', 'why', 'notice']);
    expect(fields[0]).toMatchObject({ label: 'First name', required: true, type: 'text' });
    expect(fields[3].type).toBe('textarea');
    expect(fields[4].options).toEqual(['Immediate', '30 days']);
  });

  it('recognises single postings on each ATS', () => {
    expect(atsRef('https://job-boards.greenhouse.io/humaninterest/jobs/7311234')).toEqual({ type: 'greenhouse', slug: 'humaninterest', id: '7311234' });
    expect(atsRef('https://boards.greenhouse.io/embed/job_app?for=acme&token=123')).toEqual({ type: 'greenhouse', slug: 'acme', id: '123' });
    expect(atsRef('https://jobs.lever.co/cred/0f2a1b3c-1111-2222-3333-444455556666/apply')).toEqual({ type: 'lever', slug: 'cred', id: '0f2a1b3c-1111-2222-3333-444455556666' });
    expect(atsRef('https://jobs.ashbyhq.com/deel/0f2a1b3c-1111-2222-3333-444455556666')).toMatchObject({ type: 'ashby', slug: 'deel' });
    expect(atsRef('https://jll.wd1.myworkdayjobs.com/en-US/jllcareers/job/Bengaluru-KA/Manager-Talent-Acquisition_REQ1')).toEqual({
      type: 'workday', host: 'jll.wd1.myworkdayjobs.com', tenant: 'jll', site: 'jllcareers', path: '/job/Bengaluru-KA/Manager-Talent-Acquisition_REQ1',
    });
    expect(atsRef('https://jobs.smartrecruiters.com/Visa/744000012345678-senior-recruiter')).toEqual({ type: 'smartrecruiters', slug: 'Visa', id: '744000012345678' });
    expect(atsRef('https://www.naukri.com/job-listings-123')).toBeNull();
  });
});

describe('Lever application form', () => {
  it('reads the question, not the upload status and hints around it', () => {
    const fields = formFields(`<form>
      <label class="application-question"><div class="application-label">Resume/CV<span class="required">✱</span></div>
        <div class="application-field"><input type="file" name="resume"><span>ATTACH RESUME/CV</span><span>Couldn't auto-read resume.</span><span>Analyzing resume...</span><span>Success!</span></div></label>
      <label class="application-question"><div class="application-label">Full name<span class="required">✱</span></div><input type="text" name="name"></label>
      <label class="application-question"><div class="application-label">Current location</div><input type="text" name="location"><div class="dropdown-results">No location found. Try entering a different location</div><span>Loading</span></label>
    </form>`);
    expect(fields.map((f) => [f.label, f.required])).toEqual([['Resume/CV', true], ['Full name', true], ['Current location', false]]);
  });
});
