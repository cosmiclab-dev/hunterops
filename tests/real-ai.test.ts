// What went wrong with a real model on the live app (2026-10-28) and must not again:
// a cut-off or malformed JSON answer, an evaluation saved without a score, and
// an employer's form taken from another company.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatJson, closeTruncatedJson, type LlmConfig } from '@/lib/llm/client';
import { normalizeEvaluation, runEvaluation } from '@/lib/career-ops/evaluate';
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
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply(JSON.stringify({ summary: { tldr: 'Recruiter role' }, dimensions: { cv: null }, score: null, verdict: { apply: false, headline: '', why: '' } })))
      .mockResolvedValueOnce(reply(JSON.stringify({ dimensions: { cv: 4, northStar: 4, comp: 3, culture: 3, redFlags: 4 }, score: 3.9, verdict: { apply: true, headline: 'Worth applying', why: 'Strong sourcing match' } })));
    vi.stubGlobal('fetch', fetch);
    const { evaluation } = await runEvaluation(cfg, args);
    expect(evaluation.score).toBe(3.9);
    expect(evaluation.verdict.headline).toBe('Worth applying');
    expect(evaluation.summary.tldr).toBe('Recruiter role');
  });

  it('never returns an evaluation without a score', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(JSON.stringify({ summary: { tldr: 'x' }, score: null }))));
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
