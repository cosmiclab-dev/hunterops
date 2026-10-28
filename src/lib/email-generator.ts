// Module B: The "Strategist" email writer.
// Two copywriting frameworks (from the marketingskills playbook) shape every
// recruiter email and cover letter; the draft then passes the Anti-Slop guard.
import type { Settings } from './settings';
import { llmConfig } from './llm/client';
import { profileToText, type ProfileInput } from './profile';
import { EMAIL_FRAMEWORKS, emailMessages, type EmailFramework, type EmailKind, type WritingTone } from './prompts';
import { extraBanned, writeClean } from './writer';

export type Framework = 'AIDA' | 'PAS';

// The structure line each system prompt is built around (see emailMessages in prompts.ts).
export const SYSTEM_PROMPTS: Record<Framework, string> = {
  AIDA: EMAIL_FRAMEWORKS.aida,
  PAS: EMAIL_FRAMEWORKS.pas,
};

export const toFramework = (f: string | null | undefined): EmailFramework => {
  const v = String(f || '').toLowerCase();
  return v === 'aida' || v === 'pas' ? v : 'plain';
};

// The person's signature replaces the model's bare first-name sign-off.
export function withSignature(body: string, signature: string | null) {
  const sig = (signature || '').trim();
  if (!sig) return body;
  const lines = body.split('\n');
  const last = lines[lines.length - 1]?.trim() || '';
  const firstLine = sig.split('\n')[0].trim();
  const lastKey = last.toLowerCase().replace(/[^a-z]/g, '');
  // Drop a bare sign-off name the model wrote when the signature repeats it.
  if (lastKey && last.split(/\s+/).length <= 2 && firstLine.toLowerCase().replace(/[^a-z]/g, '').includes(lastKey)) lines.pop();
  return `${lines.join('\n').trimEnd()}\n\n${sig}`;
}

export async function generateEmail(settings: Settings, a: {
  kind: EmailKind; framework: EmailFramework; profile: ProfileInput; company: string; role?: string; jd?: string;
  recipientName?: string; recipientTitle?: string; previous?: string;
}) {
  const out = await writeClean<{ subject?: string; body?: string }>(llmConfig(settings), emailMessages({
    kind: a.kind,
    framework: a.framework,
    profileText: profileToText(a.profile),
    company: a.company,
    role: a.role,
    jd: a.jd,
    recipientName: a.recipientName,
    recipientTitle: a.recipientTitle,
    previous: a.previous,
    facts: a.kind === 'cover_letter' && a.profile.noticePeriod ? `notice period ${a.profile.noticePeriod}` : undefined,
    tone: (['warm', 'formal', 'direct'].includes(settings.get('writing_tone') || '') ? settings.get('writing_tone') : 'warm') as WritingTone,
    short: settings.get('email_length') === 'short',
  }), { maxTokens: 1200, temperature: 0.5, extra: extraBanned(settings) });
  return {
    subject: String(out.data?.subject ?? '').trim().slice(0, 200),
    body: withSignature(String(out.data?.body ?? '').trim(), settings.get('email_signature')).slice(0, 6000),
    slop: out.slop,
    model: out.model,
  };
}
