// Stand-ins for the outside web during end-to-end tests: the Serper search API,
// the Greenhouse and Lever job APIs, and two ordinary job pages (one that may be
// framed, one that refuses). The app reaches them through SEARCH_API_BASE and
// ATS_API_BASE, with ALLOW_PRIVATE_FETCH=1 so localhost is allowed.
import http from 'node:http';

const PORT = Number(process.env.MOCK_WEB_PORT || 4020);
const BASE = `http://127.0.0.1:${PORT}`;
export const searches = [];

const GH_JD = `&lt;h2&gt;About the role&lt;/h2&gt;&lt;p&gt;Senior Talent Acquisition Partner for our Bengaluru GCC.&lt;/p&gt;
&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;6+ years of experience in tech hiring&lt;/li&gt;&lt;li&gt;Boolean search and LinkedIn Recruiter&lt;/li&gt;&lt;li&gt;Stakeholder management&lt;/li&gt;&lt;/ul&gt;
&lt;h3&gt;Nice to have&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Workday&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;Hybrid, 3 days a week in Bengaluru. CTC 22-30 LPA.&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;`;

const LEVER_ID = '0f2a1b3c-1111-2222-3333-444455556666';

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string';
  res.writeHead(status, { 'content-type': isJson ? 'application/json' : 'text/html; charset=utf-8', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const url = new URL(req.url, BASE);
    const p = url.pathname;

    if (p === '/search' && req.method === 'POST') {
      if (req.headers['x-api-key'] !== 'serper-e2e') return send(res, 401, { message: 'Unauthorized' });
      const body = JSON.parse(raw || '{}');
      searches.push(body);
      const organic = [];
      if (/greenhouse/.test(body.q)) {
        organic.push({ title: 'Job Application for Senior Talent Acquisition Partner at Acme Cloud', link: 'https://job-boards.greenhouse.io/acmecloud/jobs/555', snippet: 'Bengaluru · Hybrid · 6+ years of tech hiring', date: '5 hours ago' });
      }
      if (/lever/.test(body.q)) {
        organic.push({ title: 'Acme Pay - Talent Acquisition Specialist', link: `https://jobs.lever.co/acmepay/${LEVER_ID}`, snippet: 'Remote, India', date: '2 hours ago' });
      }
      if (/linkedin\.com\/in/.test(body.q)) {
        organic.push({ title: 'Meera Iyer - Head of Talent Acquisition - Acme Cloud | LinkedIn', link: 'https://in.linkedin.com/in/meera-iyer', snippet: 'Bengaluru · Head of Talent Acquisition at Acme Cloud GCC' });
      }
      return send(res, 200, { organic });
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
