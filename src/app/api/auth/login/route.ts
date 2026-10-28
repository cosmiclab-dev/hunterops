import { NextResponse } from 'next/server';
import { HttpError, readJson, route } from '@/lib/http';
import { safeEqual } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { SESSION_COOKIE, SESSION_MAX_AGE, makeSession, passwordRequired } from '@/lib/session';

export const POST = route(async (req: Request) => {
  const { password } = await readJson<{ password?: string }>(req);
  if (!passwordRequired()) return NextResponse.json({ ok: true });
  // After 5 wrong passwords in a row, sign-in pauses for 15 minutes, for every device.
  const row = await prisma.setting.findUnique({ where: { key: 'login_lock' } });
  const lock = row ? (JSON.parse(row.value) as { fails: number; until: number }) : { fails: 0, until: 0 };
  if (lock.until > Date.now()) {
    throw new HttpError(429, `Too many wrong passwords. Try again in ${Math.ceil((lock.until - Date.now()) / 60_000)} min.`);
  }
  if (typeof password !== 'string' || !safeEqual(password, process.env.APP_PASSWORD as string)) {
    const fails = lock.fails + 1;
    const next = { fails: fails >= 5 ? 0 : fails, until: fails >= 5 ? Date.now() + 15 * 60_000 : 0 };
    await prisma.setting.upsert({ where: { key: 'login_lock' }, create: { key: 'login_lock', value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    throw new HttpError(401, fails >= 5 ? 'Wrong password. Sign-in is paused for 15 minutes.' : 'Wrong password.');
  }
  if (lock.fails) await prisma.setting.delete({ where: { key: 'login_lock' } }).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await makeSession(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE,
  });
  return res;
});
