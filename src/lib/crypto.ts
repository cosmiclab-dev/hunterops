// Secrets at rest (AES-256-GCM), keyed from the APP_SECRET environment variable.
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http';

function secret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) {
    throw new HttpError(503, 'APP_SECRET is missing or shorter than 32 characters. Set it in Vercel environment variables.');
  }
  return s;
}

const encKey = () => createHash('sha256').update(`enc:${secret()}`).digest();

export const hasAppSecret = () => Boolean(process.env.APP_SECRET && process.env.APP_SECRET.length >= 32);

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decrypt(token: string) {
  const [v, iv, tag, data] = token.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unknown secret format');
  const decipher = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

export function safeEqual(a: string, b: string) {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}
