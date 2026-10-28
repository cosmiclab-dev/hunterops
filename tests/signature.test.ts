import { describe, expect, it } from 'vitest';
import { withSignature } from '../src/lib/email-generator';

describe('withSignature', () => {
  it('leaves the body alone without a signature', () => {
    expect(withSignature('Hi Asha,\n\nThanks.', null)).toBe('Hi Asha,\n\nThanks.');
    expect(withSignature('Hi', '   ')).toBe('Hi');
  });
  it('appends the signature after a blank line', () => {
    expect(withSignature('Hi Asha,\n\nBest,', 'Divya\n+91 98000 00000')).toBe('Hi Asha,\n\nBest,\n\nDivya\n+91 98000 00000');
  });
  it('drops a bare name the signature already has', () => {
    expect(withSignature('Thanks,\nDivya', 'Divya Sharma\nTalent Acquisition')).toBe('Thanks,\n\nDivya Sharma\nTalent Acquisition');
  });
  it('keeps a last line that is only punctuation', () => {
    expect(withSignature('Thanks\n--', 'Divya')).toBe('Thanks\n--\n\nDivya');
  });
});
