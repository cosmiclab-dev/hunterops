// What went wrong with a real model on the live app (2026-10-28) and must not again:
// a cut-off or malformed JSON answer, an evaluation saved without a score, and
// an employer's form taken from another company.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatJson, closeTruncatedJson, type LlmConfig } from '@/lib/llm/client';
import { evaluationMessages, normalizeEvaluation, runEvaluation } from '@/lib/career-ops/evaluate';
import { sameCompany } from '@/lib/original-posting';
import { inferNoticePeriod, profileFillSummary, normalizeProfile } from '@/lib/profile';

const cfg: LlmConfig = { provider: 'custom', format: 'openai', endpoint: 'http://llm.test/v1/chat/completions', key: 'k', model: 'm' };
const reply = (content: string, finish = 'stop') => new Response(JSON.stringify({ model: 'm', choices: [{ message: { content }, finish_reason: finish }] }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('JSON answers from a real model', () => {
  it('closes an answer cut off mid-string, keeping what was complete', () => {
    const cut = '{"summary":{"tldr":"Good fit"},"dimensions":{"cv":4,"northStar":5},"risks":["Pay not stated","US loca';
    expect(closeTruncatedJson(cut)).toEqual({ summary: { tldr: 'Good fit' }, dimensions: { cv: 4, northStar: 5 }, risks: ['Pay not stated'] });
    expect(closeTruncatedJson('```json\n{"a":[1,2,{"b":"x"}],"c":')).toEqual({ a: [1, 2, { b: 'x' }] });
    expect(closeTruncatedJson('no json here')).toBeUndefined();
  });

  it('asks once more when the answer is not JSON, and uses the second answer', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply('Sure! Here is the resume you asked for.'))
      .mockResolvedValueOnce(reply('{"summary":"ok"}'));
    vi.stubGlobal('fetch', fetch);
    const out = await chatJson(cfg, [{ role: 'user', content: 'x' }]);
    expect(out.data).toEqual({ summary: 'ok' });
    expect(fetch).toHaveBeenCalledTimes(2);
    const second = JSON.parse(fetch.mock.calls[1][1].body);
    expect(second.messages.at(-1).content).toMatch(/not a complete, valid JSON object/);
  });

  it('asks again with more room when the answer was cut off', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply('{"a":"long', 'length'))
      .mockResolvedValueOnce(reply('{"a":"long answer"}'));
    vi.stubGlobal('fetch', fetch);
    const out = await chatJson(cfg, [{ role: 'user', content: 'x' }], { maxTokens: 6000 });
    expect(out.data).toEqual({ a: 'long answer' });
    expect(JSON.parse(fetch.mock.calls[1][1].body).max_tokens).toBe(16_000);
  });

  it('fails clearly when both answers are unreadable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('I cannot help with that.')));
    await expect(chatJson(cfg, [{ role: 'user', content: 'x' }])).rejects.toThrow(/not readable, twice/);
  });
});

describe('Career-Ops scores', () => {
  it('reads scores written as text or objects, and treats 0 as blank', () => {
    const e = normalizeEvaluation({ dimensions: { cv: '4/5', northStar: { score: 5 }, comp: 0, culture: '3.5 out of 5', redFlags: null }, score: '4.2' });
    expect(e.dimensions).toEqual({ cv: 4, northStar: 5, comp: null, culture: 3.5, redFlags: null });
    expect(e.score).toBe(4.2);
    expect(normalizeEvaluation({ score: 0 }).score).toBeNull();
  });

  const args = { profileText: 'Senior recruiter, 4.5 years.', targets: ['Senior Recruiter'], job: { title: 'TA Specialist', company: 'ULOOK', location: 'Bengaluru', salary: null, url: 'https://x.test', description: 'Hire engineers. '.repeat(30) }, grill: null, signals: [], research: [], storyTitles: [] };

  it('asks for the score on its own when the full answer came without one', async () => {
    // The short score request runs alongside the full one; answer each by its prompt.
    const fetch = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => (init.body.includes('You score ONE job')
      ? reply(JSON.stringify({ dimensions: { cv: 4, northStar: 4, comp: 3, culture: 3, redFlags: 4 }, score: 3.9, verdict: { apply: true, headline: 'Worth applying', why: 'Strong sourcing match' } }))
      : reply(JSON.stringify({ summary: { tldr: 'Recruiter role' }, dimensions: { cv: null }, score: null, verdict: { apply: false, headline: '', why: '' } }))));
    vi.stubGlobal('fetch', fetch);
    const { evaluation } = await runEvaluation(cfg, args);
    expect(evaluation.score).toBe(3.9);
    expect(evaluation.verdict.headline).toBe('Worth applying');
    expect(evaluation.summary.tldr).toBe('Recruiter role');
  });

  it('keeps the score when the full answer runs out of time', async () => {
    const fetch = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      if (init.body.includes('You score ONE job')) return reply(JSON.stringify({ dimensions: { cv: 4, northStar: 4, comp: 3, culture: 3, redFlags: 4 }, score: 4.1, verdict: { apply: true, headline: 'Worth applying', why: 'Sourcing match' } }));
      throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    });
    vi.stubGlobal('fetch', fetch);
    const { evaluation } = await runEvaluation(cfg, args);
    expect(evaluation.score).toBe(4.1);
  });

  it('never returns an evaluation without a score', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => reply(JSON.stringify({ summary: { tldr: 'x' }, score: null }))));
    await expect(runEvaluation(cfg, args)).rejects.toThrow(/did not return a score/);
  });
});

describe("the employer's own posting", () => {
  it('matches the same company only', () => {
    expect(sameCompany('ULOOK', 'Marketech International Corporation USA')).toBe(false);
    expect(sameCompany('ULOOK', 'marketechinternationalcorporationusa')).toBe(false);
    expect(sameCompany('Acme Cloud Pvt Ltd', 'acmecloud')).toBe(true);
    expect(sameCompany('Razorpay', 'Razorpay Software')).toBe(true);
    expect(sameCompany('HP', 'HPE')).toBe(false);
  });
});

describe('profile from a CV', () => {
  const exp = (end: string, title = 'Senior Recruiter') => ({ company: 'Capgemini', title, location: '', start: 'November 2024', end, bullets: [] });

  it('works out the notice period: no current role means immediate', () => {
    expect(inferNoticePeriod([exp('November 2025'), exp('April 2026', 'CAREER BREAK')])).toBe('Immediate (0 days)');
    expect(inferNoticePeriod([exp('Present')])).toBe('');
    expect(inferNoticePeriod([])).toBe('');
  });

  it('says what it filled and what only the person can add', () => {
    const p = normalizeProfile({ name: 'Divya', email: 'd@x.in', phone: '+91 1', skills: ['Sourcing'], experience: [exp('November 2025')], noticePeriod: 'Immediate (0 days)' });
    const s = profileFillSummary(p);
    expect(s.filled).toEqual(expect.arrayContaining(['name', 'contact details', '1 role', '1 skills', 'notice period (Immediate (0 days))']));
    expect(s.missing).toEqual(['expected CTC']);
  });
});

describe('a free provider that allows one reply at a time', () => {
  it('sends calls one by one, spaced by LLM_MIN_GAP_MS, including retries', async () => {
    vi.resetModules();
    vi.stubEnv('LLM_MIN_GAP_MS', '200');
    const { chat, chatJson: json } = await import('@/lib/llm/client');
    const spans: [number, number][] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      const start = Date.now();
      await new Promise((r) => setTimeout(r, 30));
      spans.push([start, Date.now()]);
      const n = JSON.parse(init.body as string).messages.length;
      // The JSON call's first answer is not JSON, so it asks again.
      return reply(n === 1 && spans.length === 1 ? 'not json' : '{"ok":true}');
    }));
    await Promise.all([json(cfg, [{ role: 'user', content: 'a' }]), chat(cfg, [{ role: 'user', content: 'b' }]), chat(cfg, [{ role: 'user', content: 'c' }])]);
    expect(spans).toHaveLength(4);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0] - spans[i - 1][1]).toBeGreaterThanOrEqual(195);
    vi.unstubAllEnvs();
  });
});

describe('answers and letters go out as written', () => {
  it('fills a pay question from the profile and gives the AI the application facts', async () => {
    const { mapField, buildAnswerSheet, SLOT } = await import('@/lib/autofill');
    const { emailMessages } = await import('@/lib/prompts');
    const p = normalizeProfile({ name: 'Divya Rao', location: 'Bengaluru', expectedSalaryLpa: 7.5, noticePeriod: 'Immediate (0 days)', acceptRemote: true, onsiteCities: ['Bengaluru'] });
    const pay = mapField({ key: 'q1', label: 'What are your compensation expectations for this position?', type: 'textarea', required: true }, p);
    expect(pay).toMatchObject({ value: '7.5 LPA', source: 'profile' });

    let sent = '';
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string).messages.map((m: { content: string }) => m.content).join('\n');
      return reply('{"answers":{"q2":"No, I am based in Bengaluru.","q3":"I cut time-to-fill by [X]%."}}');
    }));
    const sheet = await buildAnswerSheet(cfg, { profile: p, company: 'Acme', role: 'TA Partner', jd: 'x', fields: [
      { key: 'q2', label: 'This role is onsite in Phoenix, AZ. Is that a reasonable commute?', type: 'text', required: true },
      { key: 'q3', label: 'Why do you want this job?', type: 'textarea', required: true },
    ] });
    expect(sent).toMatch(/Expected CTC: 7.5 LPA/);
    expect(sent).toMatch(/Open to: remote;.*on-site in Bengaluru/);
    expect(sent).toMatch(/never write placeholders/);
    expect(sheet.answers[1]).toMatchObject({ source: 'you', note: expect.stringMatching(/brackets/) });
    expect(SLOT.test('Hi [Name],')).toBe(true);
    expect(SLOT.test('[Check]')).toBe(false);

    const letter = emailMessages({ kind: 'cover_letter', framework: 'aida', profileText: 'x', company: 'Acme', facts: 'notice period Immediate (0 days)' });
    expect(letter[0].content).toMatch(/Dear Acme hiring team/);
    expect(letter[0].content).not.toMatch(/Hi \[Name\]/);
    expect(letter[1].content).toMatch(/Immediate/);
  });
});

describe('a busy provider', () => {
  it('waits as asked and tries again, twice at most', async () => {
    const { chat: send, retryAfterMs } = await import('@/lib/llm/client');
    expect(retryAfterMs(null, 'The API is at its limit. Retry after 10s')).toBe(10_000);
    expect(retryAfterMs('2', '')).toBe(2_000);
    expect(retryAfterMs(null, '')).toBe(5_000);
    const busy = () => new Response('{"error":"busy"}', { status: 503, headers: { 'retry-after': '1' } });
    const fetch = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(reply('fine'));
    vi.stubGlobal('fetch', fetch);
    expect((await send(cfg, [{ role: 'user', content: 'x' }])).content).toBe('fine');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => busy()));
    await expect(send(cfg, [{ role: 'user', content: 'x' }])).rejects.toThrow();
  }, 15_000);
});

describe('Career-Ops evaluation prompt', () => {
  it('asks for the score and verdict before the long sections, so a cut answer keeps them', () => {
    const args = { profileText: 'Senior recruiter.', targets: ['Senior Recruiter'], job: { title: 'TA', company: 'X', location: null, salary: null, url: 'https://x.test', description: 'Hire.' }, grill: null, signals: [], research: [], storyTitles: [] };
    const system = evaluationMessages(args)[0].content;
    const template = system.slice(system.indexOf('{"score"'));
    expect(template.indexOf('"verdict"')).toBeLessThan(template.indexOf('"match"'));
    expect(template.indexOf('"dimensions"')).toBeLessThan(template.indexOf('"interview"'));
  });

  it('keeps the score from an answer cut off in the middle of the long sections', () => {
    const cut = '{"score":4.2,"dimensions":{"cv":4,"northStar":5,"comp":3,"culture":4,"redFlags":4},"verdict":{"apply":true,"headline":"Worth applying","why":"Sourcing match"},"match":{"rows":[{"requirement":"Boolean sourc';
    const e = normalizeEvaluation(closeTruncatedJson(cut));
    expect(e.score).toBe(4.2);
    expect(e.verdict.headline).toBe('Worth applying');
  });
});
