import { describe, expect, it } from 'vitest';
import { bingFreshness, parseBingRss, parseDuckLite } from '@/lib/websearch';

describe('free search parsers', () => {
  it('reads Bing RSS items and decodes entities', () => {
    const xml = '<rss><channel><item><title>Senior Recruiter &amp; TA</title><link>https://jobs.lever.co/acme/1</link><description>Bengaluru</description><pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate></item><item><title>x</title><link>javascript:alert(1)</link></item></channel></rss>';
    expect(parseBingRss(xml)).toEqual([{ title: 'Senior Recruiter & TA', url: 'https://jobs.lever.co/acme/1', snippet: 'Bengaluru', age: 'Mon, 26 Oct 2026 10:00:00 GMT' }]);
  });

  it('unwraps DuckDuckGo Lite redirect links', () => {
    const html = `<a rel="nofollow" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://boards.greenhouse.io/x/jobs/9')}&amp;rut=1" class='result-link'>TA Partner</a><td class='result-snippet'>Remote India</td>`;
    expect(parseDuckLite(html)).toEqual([{ title: 'TA Partner', url: 'https://boards.greenhouse.io/x/jobs/9', snippet: 'Remote India', age: null }]);
  });

  it('reports a DuckDuckGo human check instead of working around it', () => {
    expect(() => parseDuckLite('<html>Unfortunately, bots use DuckDuckGo too. Please complete the following challenge. Select all squares containing a duck</html>')).toThrow(/human check/);
  });

  it('maps time windows to Bing filters', () => {
    expect(bingFreshness('d')).toBe('ex1:"ez1"');
    expect(bingFreshness('w')).toBe('ex1:"ez2"');
    expect(bingFreshness('d2', 864e5 * 20000)).toBe('ex1:"ez5_19998_20000"');
  });
});
