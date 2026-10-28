// Likely work-email addresses for a named person. These are guesses from the
// common corporate patterns, never verified: no mail is sent and no mail
// server is probed. The only check is whether the domain has mail servers (MX).
import { promises as dns } from 'node:dns';
import { atsRef } from './job-page';

const ATS_HOSTS = /(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|myworkdaysite\.com|smartrecruiters\.com|workable\.com|recruitee\.com|linkedin\.com|naukri\.com|indeed\.|remotive\.com|remoteok\.com|himalayas\.app|adzuna\.)/i;

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s-]/g, ' ').trim();

export function splitName(full: string): { first: string; last: string } | null {
  const parts = fold(full.replace(/\(.*?\)|,.*$|\s[-|–].*$/g, '')).split(/[\s-]+/).filter((p) => p.length > 1 && !['mr', 'ms', 'mrs', 'dr'].includes(p));
  if (!parts.length) return null;
  return { first: parts[0], last: parts.length > 1 ? parts[parts.length - 1] : '' };
}

// Ordered by how often each pattern is used at Indian and global companies.
export function emailPatterns(name: { first: string; last: string }, domain: string) {
  const { first: f, last: l } = name;
  const out = l
    ? [`${f}.${l}`, `${f}`, `${f}${l}`, `${f[0]}${l}`, `${f}${l[0]}`, `${f}_${l}`, `${f[0]}.${l}`, `${l}.${f}`]
    : [f];
  return [...new Set(out)].map((local) => `${local}@${domain}`);
}

// A company domain from a careers link that is not an ATS, else name.com.
export function guessDomains(company: string, urls: string[] = []): string[] {
  const out: string[] = [];
  for (const u of urls) {
    try {
      const host = new URL(u).hostname.toLowerCase().replace(/^(www|careers|jobs|join|apply)\./, '');
      if (!ATS_HOSTS.test(host) && !atsRef(u)) out.push(host);
    } catch { /* not a URL */ }
  }
  const base = fold(company).replace(/\b(inc|ltd|limited|pvt|private|llc|technologies|technology|labs|software|solutions|india|group|corp|corporation)\b/g, '').replace(/\s+/g, '');
  if (base) out.push(`${base}.com`, `${base}.in`, `${base}.io`);
  return [...new Set(out)].slice(0, 4);
}

export async function hasMx(domain: string): Promise<boolean> {
  try {
    const rows = await Promise.race([dns.resolveMx(domain), new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 4000))]);
    return rows.some((r) => r.exchange);
  } catch {
    return false;
  }
}

export async function guessEmails(a: { name: string; company: string; domain?: string; urls?: string[] }) {
  const name = splitName(a.name);
  if (!name) return { domain: null, mx: false, guesses: [] as string[], note: 'Add the person’s name first.' };
  const domains = a.domain ? [a.domain.toLowerCase().replace(/^.*@/, '').replace(/^https?:\/\/|\/.*$/g, '')] : guessDomains(a.company, a.urls);
  for (const d of domains) {
    if (await hasMx(d)) return { domain: d, mx: true, guesses: emailPatterns(name, d), note: `${d} accepts email. The addresses are guesses; the first is the most common pattern.` };
  }
  const d = domains[0] || null;
  return { domain: d, mx: false, guesses: d ? emailPatterns(name, d) : [], note: d ? `Could not confirm that ${d} accepts email. Type the company’s real domain to retry.` : 'Type the company’s email domain.' };
}
