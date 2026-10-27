// Sign in / out with APP_PASSWORD.
import { HttpError, json } from '../http.js';
import { checkPassword, sessionCookie, clearCookie, passwordRequired, hasSession } from '../auth.js';
import { hasAppSecret } from '../crypto.js';

async function login(ctx) {
  if (!passwordRequired()) return json(200, { ok: true, password_required: false });
  if (!hasAppSecret()) throw new HttpError(503, 'APP_SECRET must be set (32+ characters) before you can sign in.');
  const { password } = await ctx.body();
  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    throw new HttpError(401, 'Wrong password.');
  }
  return json(200, { ok: true }, { 'Set-Cookie': sessionCookie() });
}

const logout = async () => json(200, { ok: true }, { 'Set-Cookie': clearCookie() });

async function me(ctx) {
  const required = passwordRequired();
  return json(200, {
    password_required: required,
    authenticated: !required || (hasAppSecret() && hasSession(ctx.req)),
  });
}

export default [
  ['POST', '/api/auth/login', login, { public: true, noDb: true }],
  ['POST', '/api/auth/logout', logout, { public: true, noDb: true }],
  ['GET', '/api/auth/me', me, { public: true, noDb: true }],
];
