import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });

// Wraps a route handler so thrown HttpErrors become JSON error responses.
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError) {
        const first = err.issues[0];
        return NextResponse.json({ error: `${first.path.join('.') || 'body'}: ${first.message}` }, { status: 400 });
      }
      const status = (err as { status?: unknown }).status;
      if (typeof status === 'number' && status >= 400 && status < 600) return NextResponse.json({ error: (err as Error).message }, { status });
      // A unique constraint hit by a double tap or a second tab: the thing already exists.
      if ((err as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'That is already saved.' }, { status: 409 });
      console.error('[api]', err);
      return NextResponse.json({ error: 'Something went wrong on the server.' }, { status: 500 });
    }
  };
}

export async function readJson<T = unknown>(req: Request, maxBytes = 256 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request body is too large.');
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'Body must be JSON.');
  }
}
