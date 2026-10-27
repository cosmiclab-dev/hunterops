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
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
