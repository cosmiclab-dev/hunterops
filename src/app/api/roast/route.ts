import { z } from 'zod';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { llmConfig } from '@/lib/llm/client';
import { loadProfile, profileToText } from '@/lib/profile';
import { roastMessages } from '@/lib/prompts';
import { loadSettings } from '@/lib/settings';
import { writeClean } from '@/lib/writer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  bullets: z.string().trim().min(10, 'Paste at least one bullet').max(12000),
  domain: z.string().max(200).optional().default(''),
  target: z.string().max(200).optional().default(''),
});

type Roast = {
  critique?: { original?: string; why_rejected?: string; verdict?: string; rewrite?: string }[];
  rewrites?: { focus?: string; bullet?: string }[];
  summary?: string;
  weak_phrases?: string[];
};

const s = (v: unknown, max = 600) => String(v ?? '').trim().slice(0, max);

// The Capgemini profile roaster: duty-style bullets in, metric-style bullets out.
export const POST = route(async (req: Request) => {
  const body = Body.parse(await readJson(req, 64 * 1024));
  const profile = await loadProfile();
  const out = await writeClean<Roast>(llmConfig(await loadSettings()), roastMessages({
    bullets: body.bullets, domain: body.domain, target: body.target, profileText: profile ? profileToText(profile) : undefined,
  }), { maxTokens: 2600, temperature: 0.4 });
  const d = out.data || {};
  const critique = (Array.isArray(d.critique) ? d.critique : []).slice(0, 20).map((c) => ({
    original: s(c?.original), why: s(c?.why_rejected), verdict: s(c?.verdict, 20) || 'Rewrite', rewrite: s(c?.rewrite),
  })).filter((c) => c.original || c.rewrite);
  const rewrites = (Array.isArray(d.rewrites) ? d.rewrites : []).slice(0, 8).map((r) => ({ focus: s(r?.focus, 120), bullet: s(r?.bullet) })).filter((r) => r.bullet);
  const summary = s(d.summary, 1200);
  if (!critique.length && !rewrites.length) throw new HttpError(502, 'The model returned an empty audit. Try again.');
  return ok({
    critique, rewrites, summary,
    weakPhrases: (Array.isArray(d.weak_phrases) ? d.weak_phrases : []).map((p) => s(p, 80)).filter(Boolean).slice(0, 30),
    slop: out.slop, model: out.model,
  });
});
