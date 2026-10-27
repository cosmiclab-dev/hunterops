import { describe, expect, it } from 'vitest';
import { BANNED_PHRASES, applySafeFixes, scanSlop, antiSlopInstruction } from '@/lib/modules/anti-slop';

describe('Module A: Anti-Slop', () => {
  it('ships the exact banned phrase list', () => {
    expect(BANNED_PHRASES).toEqual([
      'delve', 'testament to', 'game-changer', 'landscape', 'fostering', 'tapestry', 'plethora', 'underscores',
      'paramount', 'spearheaded', 'unwavering', 'digital age', 'meticulous', 'navigating', 'poised to', 'rich history',
    ]);
  });

  it('flags every phrase, including other word forms', () => {
    const text = 'I delved into the hiring landscape, spearheading a game changer that is a testament to my unwavering, meticulous work in the digital age, fostering a rich history while navigating a plethora of reqs. This underscores how paramount it is; we are poised to grow a tapestry.';
    const r = scanSlop(text);
    const phrases = new Set(r.hits.map((h) => h.phrase));
    expect(phrases.size).toBe(BANNED_PHRASES.length);
    expect(r.clean).toBe(false);
    expect(r.score).toBe(0);
  });

  it('does not flag look-alike words', () => {
    const r = scanSlop('Landscaped office, fosterage, navigation bar, underscored_variable, delvers.');
    expect(r.hits.map((h) => h.match)).toEqual([]);
  });

  it('scores clean text 100', () => {
    const r = scanSlop('Led 42 tech hires in 6 months and cut agency spend by 30%.');
    expect(r).toMatchObject({ clean: true, score: 100 });
  });

  it('applies only safe one-word swaps and keeps case', () => {
    const out = applySafeFixes('Spearheaded hiring. A tapestry of roles.');
    expect(out.text).toBe('Led hiring. A tapestry of roles.');
    expect(out.fixed).toBe(1);
    expect(out.remaining.map((h) => h.phrase)).toEqual(['tapestry']);
  });

  it('puts the list in the prompt instruction', () => {
    for (const p of BANNED_PHRASES) expect(antiSlopInstruction()).toContain(`"${p}"`);
  });
});
