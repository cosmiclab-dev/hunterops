import { afterEach, describe, expect, it, vi } from 'vitest';
import { STANDARD_FIELDS, mapField, buildAnswerSheet } from '@/lib/autofill';
import { columnOf, dropStatus } from '@/lib/pipeline';
import { splitResultTitle, webSearch } from '@/lib/websearch';
import { heuristicProfile } from '@/lib/resume-heuristic';
import { normalizeProfile } from '@/lib/profile';
import { parseExtraBanned, scanForSlop, scanSlop, slopRejection } from '@/lib/modules/anti-slop';
import { writeClean } from '@/lib/writer';
import { refineToPlainEnglish, STE100_INSTRUCTION } from '@/lib/ste100';
import { SYSTEM_PROMPTS, toFramework } from '@/lib/email-generator';
import { emailMessages } from '@/lib/prompts';
import type { LlmConfig } from '@/lib/llm/client';
import { validateLayout } from '@/lib/modules/designer';

afterEach(() => vi.restoreAllMocks());

const cfg: LlmConfig = { provider: 'custom', format: 'openai', endpoint: 'http://mock/v1/chat/completions', key: 'k', model: 'm' };
const reply = (content: unknown) => new Response(JSON.stringify({ model: 'm', choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }));

const profile = normalizeProfile({
  name: 'Divya Sharma', email: 'divya@example.com', phone: '+91 98450 12345', linkedin: 'linkedin.com/in/divya', location: 'Bengaluru',
  skills: ['Talent Acquisition'], yearsExperience: 8, expectedSalaryLpa: 24, currentCtcLpa: 18, noticePeriod: 'Immediate (0 days)',
  experience: [{ company: 'Capgemini', title: 'Senior Recruiter', start: '2017', end: 'Present', bullets: ['Hired 120 engineers'] }],
});

describe('Auto-fill', () => {
  it('fills standard fields from the profile', () => {
    const got = Object.fromEntries(STANDARD_FIELDS.map((f) => [f.key, mapField(f, profile)]));
    expect(got.first_name.value).toBe('Divya');
    expect(got.last_name.value).toBe('Sharma');
    expect(got.email.value).toBe('divya@example.com');
    expect(got.expected_ctc.value).toBe('24 LPA');
    expect(got.current_ctc.value).toBe('18 LPA');
    expect(got.notice.value).toBe('Immediate (0 days)');
    expect(got.current_company.value).toBe('Capgemini');
    expect(got.experience.value).toBe('8');
    expect(got.resume.source).toBe('you');
    expect(got.why_company.source).toBe('ai');
  });

  it('leaves yes/no, option and only-you questions out of the profile mapping', () => {
    const f = (label: string, extra: Record<string, unknown> = {}) => mapField({ key: 'q', label, type: 'text', required: false, ...extra } as any, profile);
    expect(f('Will you require visa sponsorship to work in this location?').source).toBe('ai');
    expect(f('Are you comfortable with a phone screen?').source).toBe('ai');
    expect(f('How did you hear about us? (e.g. company website)').source).toBe('you');
    expect(f('Name of your referrer').source).toBe('you');
    expect(f('Do you have a degree in CS?').source).toBe('ai');
    expect(f('Expected salary', { type: 'select', options: ['Under 20 LPA', '20-30 LPA'] }).source).toBe('ai');
    expect(f('When can you join?').value).toBe('Immediate (0 days)');
    expect(f('Phone number').value).toBe(profile.phone);
  });

  it('asks the model only for open questions, and passes Anti-Slop', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ answers: { why_company: 'Your GCC is scaling tech hiring, which is the work I led at Capgemini.' } }));
    const sheet = await buildAnswerSheet(cfg, { fields: [], profile, company: 'Acme', role: 'Senior Recruiter', jd: 'JD' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[1].content).toContain('key "why_company"');
    expect(body.messages[1].content).not.toContain('key "email"');
    expect(sheet.generic).toBe(true);
    expect(sheet.answers.find((a) => a.key === 'why_company')?.value).toMatch(/GCC/);
  });

  it('works without AI: open questions are left for the person', async () => {
    const sheet = await buildAnswerSheet(null, { fields: [], profile, company: 'Acme', role: 'R', jd: '' });
    expect(sheet.answers.find((a) => a.key === 'why_company')?.source).toBe('you');
  });
});

describe('Pipeline columns', () => {
  it('derives columns from status and score', () => {
    expect(columnOf({ status: 'NEW', grillScore: 40 })).toBe('scouted');
    expect(columnOf({ status: 'SAVED', grillScore: null })).toBe('scouted');
    expect(columnOf({ status: 'SAVED', grillScore: 80 })).toBe('grilled');
    expect(columnOf({ status: 'INTERVIEW', grillScore: 10 })).toBe('applied');
    expect(columnOf({ status: 'REJECTED', grillScore: 90 })).toBe('rejected');
    expect(columnOf({ status: 'DISMISSED', grillScore: 90 })).toBeNull();
  });
  it('sets the right status on drop and refuses impossible drops', () => {
    expect(dropStatus({ status: 'SAVED', grillScore: 80 }, 'applied')).toEqual({ status: 'APPLIED' });
    expect(dropStatus({ status: 'APPLIED', grillScore: 80 }, 'rejected')).toEqual({ status: 'REJECTED' });
    expect(dropStatus({ status: 'APPLIED', grillScore: 80 }, 'grilled')).toEqual({ status: 'SAVED' });
    expect(dropStatus({ status: 'NEW', grillScore: 50 }, 'grilled')).toEqual({ error: expect.stringMatching(/50/) });
    expect(dropStatus({ status: 'NEW', grillScore: 90 }, 'scouted')).toEqual({ error: expect.stringMatching(/Grilled 75\+/) });
  });
});

describe('Discover web search', () => {
  it('splits result titles into role and company', () => {
    expect(splitResultTitle('Job Application for Talent Acquisition Partner at StackAdapt', 'https://job-boards.greenhouse.io/stackadapt/jobs/1')).toEqual({ role: 'Talent Acquisition Partner', company: 'StackAdapt' });
    expect(splitResultTitle('Senior Recruiter, GTM & Sales', 'https://job-boards.greenhouse.io/humaninterest/jobs/2')).toEqual({ role: 'Senior Recruiter, GTM & Sales', company: 'Humaninterest' });
    expect(splitResultTitle('Talent Partner - Deel', 'https://jobs.ashbyhq.com/deel/x')).toEqual({ role: 'Talent Partner', company: 'Deel' });
  });
  it('calls Serper with the 24-hour filter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ organic: [{ title: 'T', link: 'https://jobs.lever.co/a/b', snippet: 's', date: '3 hours ago' }] })));
    const r = await webSearch({ provider: 'serper', key: 'sk' }, 'site:jobs.lever.co "Recruiter"', 'd');
    expect(r).toEqual([{ title: 'T', url: 'https://jobs.lever.co/a/b', snippet: 's', age: '3 hours ago' }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://google.serper.dev/search');
    expect(JSON.parse(init.body as string)).toMatchObject({ tbs: 'qdr:d', q: 'site:jobs.lever.co "Recruiter"' });
    expect((init.headers as Record<string, string>)['X-API-KEY']).toBe('sk');
  });
  it('calls Brave with freshness and explains a bad key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(webSearch({ provider: 'brave', key: 'bk' }, 'q', 'w')).rejects.toThrow(/rejected the key/);
    expect(String(fetchMock.mock.calls[0][0])).toContain('freshness=pw');
  });
});

describe('CV reading without AI', () => {
  it('pulls contact details, skills and years', () => {
    const p = heuristicProfile(`Divya Sharma\nSenior Recruiter\ndivya@example.com | +91 98450 12345 | linkedin.com/in/divya-s\nBengaluru\nSummary\n8+ years of tech hiring and talent acquisition for GCCs using LinkedIn Recruiter and Boolean search.`);
    expect(p).toMatchObject({ name: 'Divya Sharma', headline: 'Senior Recruiter', email: 'divya@example.com', location: 'Bengaluru', yearsExperience: 8 });
    expect(p.phone).toMatch(/98450/);
    expect(p.linkedin).toContain('linkedin.com/in/divya-s');
    expect(p.skills).toEqual(expect.arrayContaining(['talent acquisition', 'linkedin recruiter', 'boolean search', 'tech hiring']));
  });
});

describe('Module A guard', () => {
  it('scanForSlop returns findings, with custom words from Settings', () => {
    expect(scanForSlop('We delve into the landscape.')).toEqual({ hasSlop: true, findings: ['delve into', 'landscape'] });
    const extra = parseExtraBanned('Synergy, leverage\npassionate, x');
    expect(extra).toEqual(['synergy', 'leverage', 'passionate']);
    expect(scanSlop('Passionate about synergy.', extra).hits.map((h) => h.phrase)).toEqual(['passionate', 'synergy']);
    expect(slopRejection(['delve'])).toBe('Draft rejected due to low-quality AI patterns: delve.');
  });

  it('rewrites once, swaps simple words, then saves a clean draft', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ body: 'I spearheaded hiring.' }))
      .mockResolvedValueOnce(reply({ body: 'I spearheaded hiring again.' }));
    const out = await writeClean(cfg, [{ role: 'user', content: 'x' }]);
    expect(out.data.body).toBe('I led hiring.');
    expect(out.slop.clean).toBe(true);
  });

  it('rejects a draft that still has slop with no safe swap', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ body: 'A game-changer for your tapestry.' }))
      .mockResolvedValueOnce(reply({ body: 'Still a game-changer.' }));
    await expect(writeClean(cfg, [{ role: 'user', content: 'x' }])).rejects.toThrow('Draft rejected due to low-quality AI patterns: game-changer.');
  });

  it('rejects custom banned words too', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ body: 'Synergy matters.' }));
    await expect(writeClean(cfg, [{ role: 'user', content: 'x' }], { extra: ['synergy'] })).rejects.toThrow(/synergy/);
  });
});

describe('Module B and C', () => {
  it('has AIDA and PAS system prompts and picks them by name', () => {
    expect(SYSTEM_PROMPTS.AIDA).toMatch(/Attention.*Interest.*Desire.*Action/);
    expect(SYSTEM_PROMPTS.PAS).toMatch(/Problem.*Agitate.*Solution/);
    expect(toFramework('AIDA')).toBe('aida');
    expect(toFramework('pas')).toBe('pas');
    expect(toFramework('other')).toBe('plain');
    const sys = emailMessages({ kind: 'cover_letter', framework: 'pas', profileText: 'p', company: 'Acme' })[0].content;
    expect(sys).toContain(SYSTEM_PROMPTS.PAS);
    expect(sys).toContain('under 200 words');
  });

  it('refineToPlainEnglish sends the STE100 instruction and guards the result', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply('I led hiring. We hired 40 people.'));
    const out = await refineToPlainEnglish(cfg, 'Leveraging my extensive expertise, I spearheaded hiring.');
    expect(out.text).toBe('I led hiring. We hired 40 people.');
    expect(out.sentences).toBe(2);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0].content).toContain(STE100_INSTRUCTION);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply('This is a game-changer.'));
    await expect(refineToPlainEnglish(cfg, 'x')).rejects.toThrow(/Draft rejected/);
  });
});

describe('Module E: validateLayout', () => {
  const base = { pages: 1, sections: ['Summary', 'Skills', 'Experience', 'Education'], baselines: [0, 12, 24], longBullets: [], rolesWithManyBullets: [], overflowLines: 0 };
  it('passes a clean one-page layout', () => {
    expect(validateLayout({ ...base, marginMm: 24 }, { yearsExperience: 7 })).toEqual({ ok: true, issues: [] });
  });
  it('flags page overflow, heading hierarchy and margins as errors', () => {
    const r = validateLayout({ ...base, overflowLines: 3, sections: ['Experience', 'Summary'], marginMm: 15 });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.rule)).toEqual(['overflow', 'hierarchy', 'margins']);
  });
});
