// One-off: probes candidate board slugs for starter companies whose slug failed.
const companies = {
  PhonePe: ['phonepe', 'phonepeprivatelimited', 'phonepe-1'],
  Postman: ['postman', 'postmanlabs', 'getpostman'],
  BrowserStack: ['browserstack', 'browserstack-1'],
  Chargebee: ['chargebee', 'chargebeeinc'],
  Innovaccer: ['innovaccer', 'innovaccerinc', 'innovaccer-1'],
  Rippling: ['rippling', 'rippling-1'],
  Remote: ['remotecom', 'remote', 'remote-com', 'remotetechnology'],
  Confluent: ['confluent', 'confluentinc'],
  Nutanix: ['nutanix', 'nutanixinc'],
  Toptal: ['toptal'],
  Swiggy: ['swiggy', 'bundltechnologies'],
  ShareChat: ['sharechat', 'mohalla', 'mohallatech'],
  InMobi: ['inmobi', 'inmobi-1', 'glance'],
  Whatfix: ['whatfix', 'whatfixinc'],
  Zepto: ['zeptonow', 'zepto', 'kiranakart'],
  'Dream Sports': ['dreamsports', 'dream11', 'dreamsportsinc'],
  Upstox: ['upstox', 'rksv'],
  Cars24: ['cars24', 'cars24services'],
};
const tries = {
  greenhouse: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
  lever: (s) => `https://api.lever.co/v0/postings/${s}?mode=json&limit=1`,
  ashby: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
  smartrecruiters: (s) => `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=1`,
  workable: (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}`,
};
async function count(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    const d = await r.json();
    const n = Array.isArray(d) ? d.length : (d.jobs?.length ?? d.totalFound ?? d.content?.length ?? null);
    return n;
  } catch { return null; }
}
const out = {};
await Promise.all(Object.entries(companies).map(async ([name, slugs]) => {
  const hits = [];
  for (const [ats, url] of Object.entries(tries))
    for (const s of [...new Set([...slugs, ...slugs.map((x) => x[0].toUpperCase() + x.slice(1))])]) {
      const n = await count(url(s));
      if (n !== null && n > 0) hits.push(`${ats}:${s}(${n})`);
    }
  out[name] = hits;
}));
const wd = [
  ['Walmart', 'walmart.wd5.myworkdayjobs.com', ['WalmartExternal', 'walmartexternal', 'External']],
  ['Dell', 'dell.wd1.myworkdayjobs.com', ['External', 'Dell_Careers', 'ExternalNonPublic']],
  ['Synopsys', 'synopsys.wd1.myworkdayjobs.com', ['careers', 'Careers', 'External', 'SynopsysCareers']],
];
for (const [name, host, sites] of wd) {
  const res = [];
  for (const site of sites) {
    for (const limit of [20, 10]) {
      try {
        const r = await fetch(`https://${host}/wday/cxs/${host.split('.')[0]}/${site}/jobs`, {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ appliedFacets: {}, limit, offset: 0, searchText: 'recruiter' }),
          signal: AbortSignal.timeout(15000),
        });
        const t = await r.text();
        res.push(`${site} limit=${limit}: ${r.status} ${t.slice(0, 120).replace(/\s+/g, ' ')}`);
      } catch (e) { res.push(`${site}: ${e.message}`); }
    }
  }
  out['WD ' + name] = res;
}
console.log(JSON.stringify(out, null, 1));
