import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const clip = (s: string | null | undefined, max: number) =>
  s && s.length > max ? s.slice(0, max) : s || null;

export const csv = (v: unknown) =>
  String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function timeAgo(date: Date | string | null | undefined, now = Date.now()) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

export const wordCount = (t: string) => (t.trim().match(/\S+/g) || []).length;

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const okCopy = document.execCommand('copy');
    ta.remove();
    return okCopy;
  }
}
