import { describe, expect, it } from 'vitest';
import { emailPatterns, guessDomains, splitName } from '@/lib/email-guess';

describe('email guesses', () => {
  it('splits LinkedIn-style names', () => {
    expect(splitName('Meera Iyer - Head of Talent Acquisition - Acme Cloud | LinkedIn')).toEqual({ first: 'meera', last: 'iyer' });
    expect(splitName('Dr. Anil K. Sharma')).toEqual({ first: 'anil', last: 'sharma' });
    expect(splitName('Zoë')).toEqual({ first: 'zoe', last: '' });
  });
  it('orders the common patterns', () => {
    expect(emailPatterns({ first: 'meera', last: 'iyer' }, 'acme.com').slice(0, 4)).toEqual(['meera.iyer@acme.com', 'meera@acme.com', 'meeraiyer@acme.com', 'miyer@acme.com']);
  });
  it('prefers a non-ATS careers domain, then the company name', () => {
    expect(guessDomains('Acme Cloud Pvt Ltd', ['https://boards.greenhouse.io/acme/jobs/1', 'https://careers.acmecloud.in/jobs/9'])).toEqual(['acmecloud.in', 'acmecloud.com', 'acmecloud.io']);
  });
});
