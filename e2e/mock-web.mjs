// Stand-ins for the outside web during end-to-end tests: Bing RSS, DuckDuckGo Lite, the Serper search API,
// the Greenhouse and Lever job APIs, and two ordinary job pages (one that may be
// framed, one that refuses). The app reaches them through SEARCH_API_BASE and
// ATS_API_BASE, with ALLOW_PRIVATE_FETCH=1 so localhost is allowed.
import http from 'node:http';

const PORT = Number(process.env.MOCK_WEB_PORT || 4020);
// The user-journey run turns on a few company boards and Adzuna for its scan.
const BOARDS = process.env.MOCK_BOARDS === '1';
const BASE = `http://127.0.0.1:${PORT}`;
export const searches = [];
export const crawls = [];

const GH_JD = `&lt;h2&gt;About the role&lt;/h2&gt;&lt;p&gt;Senior Talent Acquisition Partner for our Bengaluru GCC.&lt;/p&gt;
&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;6+ years of experience in tech hiring&lt;/li&gt;&lt;li&gt;Boolean search and LinkedIn Recruiter&lt;/li&gt;&lt;li&gt;Stakeholder management&lt;/li&gt;&lt;/ul&gt;
&lt;h3&gt;Nice to have&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Workday&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;Hybrid, 3 days a week in Bengaluru. CTC 22-30 LPA.&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;`;

const LEVER_ID = '0f2a1b3c-1111-2222-3333-444455556666';

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string';
  res.writeHead(status, { 'content-type': isJson ? 'application/json' : 'text/html; charset=utf-8', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}

function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function results(q) {
  const organic = [];
  if (/greenhouse/.test(q)) {
    organic.push({ title: 'Job Application for Senior Talent Acquisition Partner at Acme Cloud', link: 'https://job-boards.greenhouse.io/acmecloud/jobs/555', snippet: 'Bengaluru · Hybrid · 6+ years of tech hiring', date: '5 hours ago' });
  }
  if (/lever/.test(q)) {
    organic.push({ title: 'Acme Pay - Talent Acquisition Specialist', link: `https://jobs.lever.co/acmepay/${LEVER_ID}`, snippet: 'Remote, India', date: '2 hours ago' });
  }
  if (/linkedin\.com\/in/.test(q)) {
    organic.push({ title: 'Meera Iyer - Head of Talent Acquisition - Acme Cloud | LinkedIn', link: 'https://in.linkedin.com/in/meera-iyer', snippet: 'Bengaluru · Head of Talent Acquisition at Acme Cloud GCC' });
  }
  return organic.map((r) => ({ ...r }));
}

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const url = new URL(req.url, BASE);
    const p = url.pathname;

    // A job page that only shows its posting after JavaScript runs, and a
    // stand-in Crawl4AI server that returns the rendered page.
    if (p === '/page/spa') return send(res, 200, '<html><head><title>Loading</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
    if (p === '/page/blocked') return send(res, 403, '<html><body>Access denied</body></html>');
    // Hosted page reader (Jina Reader shape): /reader/<target url>.
    if (p.startsWith('/reader/')) {
      const target = decodeURIComponent(req.url.slice('/reader/'.length));
      crawls.push(target);
      if (/blocked/.test(target)) return send(res, 422, { code: 422, readableMessage: 'Target returned 403' });
      if (!/\/page\/spa|example\.com/.test(target)) return send(res, 422, { code: 422, readableMessage: 'Failed to load the target page' });
      if (/example\.com/.test(target)) return send(res, 200, { code: 200, data: { title: 'Example Domain', url: target, content: 'This domain is for use in examples.' } });
      return send(res, 200, { code: 200, data: { title: 'Talent Partner, India', url: target, content: 'Spa Jobs is hiring a Talent Partner in Bengaluru to run end-to-end hiring for engineering and product teams.\n\n## What you will do\n\n- Own full-cycle recruiting for 15 to 20 open roles at a time\n- Build sourcing plans with Boolean search, LinkedIn Recruiter and referrals\n- Partner with hiring managers on scorecards, interview loops and offers\n\n## What you bring\n\n- 6+ years of recruiting, including tech hiring in India\n\nHybrid, Bengaluru. CTC 24-32 LPA.' } });
    }
    if (p === '/crawl' && req.method === 'POST') {
      if (req.headers.authorization !== `Basic ${Buffer.from('hunter:c4-e2e').toString('base64')}`) return send(res, 401, { detail: 'Not authenticated' });
      const body = JSON.parse(raw || '{}');
      crawls.push(body.urls?.[0]);
      const target = String(body.urls?.[0] || '');
      if (/blocked/.test(target)) return send(res, 200, { success: true, results: [{ url: target, success: false, status_code: 403, error_message: 'Blocked' }] });
      const html = `<html><head><title>Talent Partner, India | Spa Jobs</title></head><body><main><h1>Talent Partner, India</h1><p>Spa Jobs is hiring a Talent Partner in Bengaluru to run end-to-end hiring for engineering and product teams.</p><h3>What you will do</h3><ul><li>Own full-cycle recruiting for 15 to 20 open roles at a time</li><li>Build sourcing plans with Boolean search, LinkedIn Recruiter and referrals</li><li>Partner with hiring managers on scorecards, interview loops and offers</li></ul><h3>What you bring</h3><ul><li>6+ years of recruiting, including tech hiring in India</li><li>Clear stakeholder management and offer negotiation</li></ul><p>Hybrid, Bengaluru. CTC 24-32 LPA.</p></main></body></html>`;
      return send(res, 200, { success: true, results: [{ url: target, success: true, status_code: 200, html, markdown: { raw_markdown: '# Talent Partner, India', fit_markdown: '# Talent Partner, India' } }] });
    }
    if (p === '/search' && req.method === 'POST') {
      if (req.headers['x-api-key'] !== 'serper-e2e') return send(res, 401, { message: 'Unauthorized' });
      const body = JSON.parse(raw || '{}');
      searches.push({ ...body, engine: 'serper' });
      return send(res, 200, { organic: results(body.q) });
    }
    // Free search: Bing's RSS results, and DuckDuckGo Lite as the fallback.
    if (p === '/search' && url.searchParams.get('format') === 'rss') {
      const q = url.searchParams.get('q') || '';
      searches.push({ q, engine: 'bing', filters: url.searchParams.get('filters') });
      const items = /bing-down/.test(q) ? [] : results(q);
      return send(res, 200, `<?xml version="1.0"?><rss><channel>${items.map((r) => `<item><title>${esc(r.title)}</title><link>${esc(r.link)}</link><description>${esc(r.snippet)}</description></item>`).join('')}</channel></rss>`, { 'content-type': 'application/rss+xml' });
    }
    if (p === '/lite/') {
      const q = url.searchParams.get('q') || '';
      searches.push({ q, engine: 'ddg' });
      const rows = results(q.replace('bing-down', '')).map((r) => `<tr><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(r.link)}&amp;rut=x" class='result-link'>${esc(r.title)}</a></td></tr><tr><td class='result-snippet'>${esc(r.snippet)}</td></tr>`);
      return send(res, 200, `<html><body><table>${rows.join('')}</table></body></html>`);
    }

    // A starter company board with two recruiter roles and one that the scan skips.
    if (BOARDS && p === '/v1/boards/figma/jobs') {
      const at = new Date(Date.now() - 3 * 3600_000).toISOString();
      return send(res, 200, { jobs: [
        { id: 9101, title: 'Senior Technical Recruiter', absolute_url: 'https://job-boards.greenhouse.io/figma/jobs/9101', location: { name: 'Bengaluru, India' }, first_published: at, content: GH_JD },
        { id: 9102, title: 'Talent Acquisition Partner, GTM', absolute_url: 'https://job-boards.greenhouse.io/figma/jobs/9102', location: { name: 'Remote - India' }, first_published: at, content: '&lt;p&gt;Partner with sales leaders. 5+ years of recruiting, LinkedIn Recruiter, Greenhouse.&lt;/p&gt;' },
        { id: 9103, title: 'Software Engineer, Infrastructure', absolute_url: 'https://job-boards.greenhouse.io/figma/jobs/9103', location: { name: 'Bengaluru, India' }, first_published: at, content: '&lt;p&gt;Go and Kubernetes.&lt;/p&gt;' },
      ] });
    }
    if (p === '/v1/boards/figma/jobs/9101') {
      return send(res, 200, {
        id: 9101, title: 'Senior Technical Recruiter', company_name: 'Figma', absolute_url: 'https://job-boards.greenhouse.io/figma/jobs/9101',
        location: { name: 'Bengaluru, India' }, first_published: new Date(Date.now() - 3 * 3600_000).toISOString(), content: GH_JD,
        questions: [
          { label: 'First Name', required: true, fields: [{ name: 'first_name', type: 'input_text' }] },
          { label: 'Last Name', required: true, fields: [{ name: 'last_name', type: 'input_text' }] },
          { label: 'Email', required: true, fields: [{ name: 'email', type: 'input_text' }] },
          { label: 'Resume/CV', required: true, fields: [{ name: 'resume', type: 'input_file' }] },
          { label: 'What is your notice period?', required: true, fields: [{ name: 'question_9', type: 'input_text' }] },
        ],
      });
    }
    // Workday: the list has no descriptions; the detail call has one.
    if (BOARDS && p === '/wday/cxs/amat/External/jobs' && req.method === 'POST') {
      const body = JSON.parse(raw || '{}');
      return send(res, 200, { jobPostings: body.offset ? [] : [{ title: 'Talent Sourcer', externalPath: '/job/Bangalore-IND/Talent-Sourcer_R1', locationsText: 'Bangalore, IND', postedOn: 'Posted Today' }] });
    }
    if (p === '/wday/cxs/amat/External/job/Bangalore-IND/Talent-Sourcer_R1') {
      return send(res, 200, { jobPostingInfo: { title: 'Talent Sourcer', jobDescription: '<p>Source engineers for our Bangalore R&amp;D centre.</p><p>Requirements: 3+ years of sourcing, Boolean search, LinkedIn Recruiter.</p>' } });
    }
    // Adzuna: a listing whose page hides the employer's form; the same job is on Greenhouse.
    if (BOARDS && p === '/v1/api/jobs/in/search/1') {
      if (url.searchParams.get('app_key') !== 'adzuna-e2e') return send(res, 401, { exception: 'AUTH_FAIL' });
      return send(res, 200, { results: url.searchParams.get('where') ? [{
        id: '777', title: 'Senior Talent Acquisition Partner', company: { display_name: 'Acme Cloud' }, location: { display_name: 'Bangalore, Karnataka' },
        redirect_url: 'https://www.adzuna.in/details/777?utm_medium=api', created: new Date().toISOString(), description: 'Senior Talent Acquisition Partner for our Bengaluru GCC. 6+ years of tech hiring…',
      }] : [] });
    }
    // Greenhouse job API
    if (p === '/v1/boards/acmecloud/jobs/555') {
      return send(res, 200, {
        id: 555, title: 'Senior Talent Acquisition Partner', company_name: 'Acme Cloud', absolute_url: `${BASE}/acmecloud/careers?gh_jid=555`,
        location: { name: 'Bengaluru, India' }, first_published: new Date(Date.now() - 5 * 3600_000).toISOString(), content: GH_JD,
        questions: [
          { label: 'First Name', required: true, fields: [{ name: 'first_name', type: 'input_text' }] },
          { label: 'Last Name', required: true, fields: [{ name: 'last_name', type: 'input_text' }] },
          { label: 'Email', required: true, fields: [{ name: 'email', type: 'input_text' }] },
          { label: 'Resume/CV', required: true, fields: [{ name: 'resume', type: 'input_file' }] },
          { label: 'Expected CTC', required: false, fields: [{ name: 'question_1', type: 'input_text' }] },
          { label: 'Notice period', required: true, fields: [{ name: 'question_2', type: 'multi_value_single_select', values: [{ label: 'Immediate', value: 1 }, { label: '30 days', value: 2 }] }] },
          { label: 'Why do you want to join Acme Cloud?', required: false, fields: [{ name: 'question_3', type: 'textarea' }] },
        ],
      });
    }
    // Lever posting API and its apply page
    if (p === `/v0/postings/acmepay/${LEVER_ID}`) {
      return send(res, 200, {
        id: LEVER_ID, text: 'Talent Acquisition Specialist', hostedUrl: `${BASE}/lever/acmepay/${LEVER_ID}`, applyUrl: `${BASE}/lever/acmepay/${LEVER_ID}/apply`,
        categories: { location: 'Remote, India', allLocations: ['Remote, India'] }, workplaceType: 'remote', createdAt: Date.now() - 2 * 3600_000,
        description: '<p>Hire for our payments teams.</p>', lists: [{ text: 'Requirements', content: '<li>4+ years of recruiting</li><li>Excel</li>' }], additional: '',
      });
    }
    if (p === `/lever/acmepay/${LEVER_ID}/apply`) {
      return send(res, 200, `<html><body><form>
        <label for="n">Full name</label><input id="n" name="name" required>
        <label for="e">Email</label><input id="e" name="email" type="email" required>
        <label for="ph">Phone</label><input id="ph" name="phone">
        <label for="li">LinkedIn URL</label><input id="li" name="urls[LinkedIn]">
        <label for="c">Current company</label><input id="c" name="org">
        <label for="w">Why payments?</label><textarea id="w" name="cards[abc][field0]"></textarea>
        <input type="hidden" name="token" value="x"></form></body></html>`);
    }
    if (p.startsWith('/lever/')) return send(res, 200, '<html><body><h1>Talent Acquisition Specialist</h1></body></html>', { 'x-frame-options': 'DENY' });

    // Ordinary job pages
    if (p === '/page/framable' || p === '/acmecloud/careers') {
      return send(res, 200, '<html><head><title>Senior TA Partner</title></head><body><main><h1>Senior Talent Acquisition Partner</h1><p>Apply below.</p></main></body></html>');
    }
    if (p === '/careers/senior-recruiter') {
      const ld = { '@type': 'JobPosting', title: 'Senior Recruiter', hiringOrganization: { name: 'Zeta Labs' }, datePosted: new Date().toISOString(),
        jobLocation: { address: { addressLocality: 'Bengaluru', addressCountry: 'IN' } },
        description: '<p>Own tech hiring for our Bengaluru office.</p><p>Requirements: 5+ years of experience in tech hiring, Boolean search, LinkedIn Recruiter, stakeholder management. Hybrid, Bengaluru.</p><p>Salary: ₹20-26 LPA</p>' };
      return send(res, 200, `<html><head><title>Senior Recruiter | Zeta Labs</title><script type="application/ld+json">${JSON.stringify(ld)}</script></head>
        <body><nav>Menu</nav><main><h1>Senior Recruiter</h1><p onclick="x()">Own tech hiring for our Bengaluru office.</p><script>alert('x')</script>
        <form><label for="fn">First name</label><input id="fn" name="first_name" required><label for="np">Notice period</label><input id="np" name="notice"></form></main></body></html>`,
      { 'x-frame-options': 'SAMEORIGIN' });
    }
    send(res, 404, { error: 'not found' });
  });
}).listen(PORT, () => console.log(`mock web on :${PORT}`));
