import { describe, expect, it } from 'vitest';
import { authHeader } from '../src/lib/crawl4ai';
import { looksLikeBotCheck } from '../src/lib/bot-check';

describe('page reader', () => {
  it('sends a password as Basic auth and a token as Bearer', () => {
    expect(authHeader(null)).toEqual({});
    expect(authHeader('hunter:secret')).toEqual({ Authorization: `Basic ${Buffer.from('hunter:secret').toString('base64')}` });
    expect(authHeader('eyJhbGciOi')).toEqual({ Authorization: 'Bearer eyJhbGciOi' });
  });
  it('treats short human-check pages as unreadable', () => {
    expect(looksLikeBotCheck('Just a moment... Checking your browser before accessing')).toBe(true);
    expect(looksLikeBotCheck(`Just a moment ${'real posting text '.repeat(300)}`)).toBe(false);
    expect(looksLikeBotCheck('Senior Recruiter, Bengaluru. Own full-cycle hiring.')).toBe(false);
  });
});
