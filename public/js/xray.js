// Tab 1: Google X-ray generators with the freshness filter baked into the URL.
import { h, $, copyText, storage } from './dom.js';

const GLOBAL = [
  {
    ats: 'greenhouse', name: 'Greenhouse',
    q: '(site:boards.greenhouse.io OR site:job-boards.greenhouse.io) ("Senior Recruiter" OR "Technical Recruiter" OR "Talent Acquisition Partner") (Bengaluru OR Bangalore OR "Remote India" OR Remote)',
  },
  {
    ats: 'ashby', name: 'Ashby',
    q: 'site:jobs.ashbyhq.com ("Senior Recruiter" OR "Technical Recruiter" OR "Talent Acquisition Partner") (Bengaluru OR Bangalore OR India)',
  },
  {
    ats: 'lever', name: 'Lever',
    q: 'site:jobs.lever.co ("Senior Recruiter" OR "Technical Recruiter" OR "Talent Acquisition") (Bengaluru OR Bangalore OR India OR Remote) -intern',
  },
  {
    ats: 'smartrecruiters', name: 'SmartRecruiters',
    q: 'site:jobs.smartrecruiters.com ("Senior Recruiter" OR "Talent Acquisition Specialist" OR "Talent Acquisition Partner") (Bengaluru OR Bangalore)',
  },
];

const INDIA = [
  {
    ats: 'workday', name: 'Workday',
    q: 'site:myworkdayjobs.com ("Senior Recruiter" OR "Talent Acquisition") (Bengaluru OR Bangalore OR Karnataka)',
  },
  {
    ats: 'successfactors', name: 'SuccessFactors',
    q: '(site:successfactors.com OR site:successfactors.eu) ("Recruiter" OR "Talent Acquisition") (Bengaluru OR Bangalore)',
  },
  {
    ats: 'darwinbox', name: 'Darwinbox',
    q: 'site:darwinbox.in ("Recruiter" OR "Talent Acquisition") (Bengaluru OR Bangalore)',
  },
  {
    ats: 'keka', name: 'Keka',
    q: 'site:keka.com ("Recruiter" OR "Talent Acquisition") (Bengaluru OR Bangalore)',
  },
  {
    ats: 'zoho', name: 'Zoho Recruit',
    q: 'site:zohorecruit.in ("Recruiter" OR "Talent Acquisition") (Bengaluru OR Bangalore)',
  },
];

const HIRING_MANAGER = [
  {
    id: 'li-posts', ats: 'linkedin', name: 'TA heads posting "we\'re hiring"', tag: 'LinkedIn posts',
    q: '("we\'re hiring" OR "we are hiring" OR "scaling our team" OR "growing our TA team" OR "join my team") AND (recruiter OR "talent acquisition") AND (Bengaluru OR Bangalore)',
    note: 'Opens LinkedIn post search, sorted by latest.',
    url: (q, fresh) => {
      const date = fresh === 'qdr:d' ? 'past-24h' : fresh === 'qdr:w' ? 'past-week' : 'past-week';
      return `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(q)}&datePosted=${encodeURIComponent(`"${date}"`)}&sortBy=${encodeURIComponent('"date_posted"')}`;
    },
  },
  {
    id: 'g-posts', ats: 'linkedin', name: 'Hiring posts via Google', tag: 'Google',
    q: 'site:linkedin.com/posts ("hiring" OR "join my team" OR "open role") ("talent acquisition" OR "recruiter") (Bengaluru OR Bangalore)',
    note: 'Catches posts LinkedIn search misses.',
  },
  {
    id: 'gcc-leads', ats: 'linkedin', name: 'TA leads at Bengaluru GCCs', tag: 'Google',
    q: 'site:linkedin.com/in ("Head of Talent Acquisition" OR "Director Talent Acquisition" OR "Talent Acquisition Lead" OR "TA Leader") ("GCC" OR "Global Capability Center" OR "Technology Center" OR "India Development Center" OR "Innovation Center") (Bengaluru OR Bangalore)',
    note: 'Profiles, so no date filter. Cross-check against Workday/SuccessFactors results to spot GCCs under hiring pressure.',
    noFreshness: true,
  },
];

const DOMAIN_ADDON = '("technology" OR "engineering" OR "tech hiring" OR "GCC")';

export function googleUrl(query, freshness) {
  const base = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  return freshness ? `${base}&tbs=${freshness}` : base;
}

function currentQuery(item, textarea) {
  let q = textarea.value.trim() || item.q;
  if ($('#domain-addon').checked && item.ats !== 'linkedin') q = `${q} ${DOMAIN_ADDON}`;
  return q;
}

function freshness() {
  return $('#freshness').value;
}

function card(item) {
  const id = item.id || item.ats;
  const saved = storage.get(`xray:${id}`);
  const textarea = h('textarea', { rows: 4, spellcheck: 'false', 'aria-label': `${item.name} search string` });
  textarea.value = saved || item.q;
  textarea.addEventListener('change', () => storage.set(`xray:${id}`, textarea.value.trim() === item.q ? '' : textarea.value.trim()));

  const windowLabel = () => {
    if (item.noFreshness) return 'Open search';
    const f = freshness();
    return f === 'qdr:d' ? 'Open: last 24h' : f === 'qdr:d2' ? 'Open: last 48h' : 'Open: last week';
  };
  const open = h('a', { class: 'btn btn-primary', target: '_blank', rel: 'noopener noreferrer' }, windowLabel());
  const refreshHref = () => {
    const q = currentQuery(item, textarea);
    open.href = item.url ? item.url(q, freshness()) : googleUrl(q, item.noFreshness ? null : freshness());
    open.textContent = windowLabel();
  };
  // Recompute on click too, so edits and toggle changes are always picked up.
  open.addEventListener('click', refreshHref);
  textarea.addEventListener('input', refreshHref);
  refreshHref();

  const copy = h('button', { type: 'button', class: 'btn' }, 'Copy string');
  copy.addEventListener('click', () => copyText(currentQuery(item, textarea), copy));

  const reset = h('button', { type: 'button', class: 'btn btn-ghost', title: 'Restore the original string' }, 'Reset');
  reset.addEventListener('click', () => {
    textarea.value = item.q;
    storage.set(`xray:${id}`, '');
    refreshHref();
  });

  const el = h('article', { class: `xray ats-${item.ats}` },
    h('div', { class: 'xray-head' }, h('h4', {}, item.name), h('span', { class: 'tag' }, item.tag || 'Google X-ray')),
    textarea,
    item.note ? h('p', { class: 'xray-note' }, item.note) : null,
    h('div', { class: 'xray-actions' }, open, copy, reset),
  );
  el.refresh = refreshHref;
  return el;
}

export function initDiscovery() {
  const cards = [];
  const mount = (selector, list) => {
    const root = $(selector);
    for (const item of list) {
      const c = card(item);
      cards.push(c);
      root.append(c);
    }
  };
  mount('#xray-global', GLOBAL);
  mount('#xray-india', INDIA);
  mount('#xray-hm', HIRING_MANAGER);

  const fresh = $('#freshness');
  fresh.value = storage.get('freshness', 'qdr:d');
  const addon = $('#domain-addon');
  addon.checked = storage.get('domain_addon') === '1';
  const refreshAll = () => cards.forEach((c) => c.refresh());
  fresh.addEventListener('change', () => {
    storage.set('freshness', fresh.value);
    refreshAll();
  });
  addon.addEventListener('change', () => {
    storage.set('domain_addon', addon.checked ? '1' : '');
    refreshAll();
  });
  refreshAll();
}
