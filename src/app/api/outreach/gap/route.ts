import { z } from 'zod';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { llmConfig } from '@/lib/llm/client';
import { profileToText, requireProfile } from '@/lib/profile';
import { gapMessages } from '@/lib/prompts';
import { loadSettings } from '@/lib/settings';
import { extraBanned, writeClean } from '@/lib/writer';

export const dynamic = 'force-dynamic';
// AI writing with thinking models: a draft plus one Anti-Slop rewrite can take minutes.
export const maxDuration = 300;

const Body = z.object({
  gapSince: z.string().trim().min(3).max(60).default('November 2025'),
  reason: z.string().max(600).optional().default(''),
});

export const POST = route(async (req: Request) => {
  const b = Body.parse(await readJson(req));
  const profile = await requireProfile();
  const settings = await loadSettings();
  const out = await writeClean<{ email?: string; phone?: string }>(llmConfig(settings), gapMessages({
    gapSince: b.gapSince, reason: b.reason, profileText: profileToText(profile),
  }), { maxTokens: 900, temperature: 0.5, extra: extraBanned(settings) });
  const email = String(out.data?.email ?? '').trim().slice(0, 2000);
  const phone = String(out.data?.phone ?? '').trim().slice(0, 2500);
  if (!email && !phone) throw new HttpError(502, 'The model returned nothing. Try again.');
  return ok({ email, phone, slop: out.slop, model: out.model });
});
