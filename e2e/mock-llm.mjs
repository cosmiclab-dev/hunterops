// A stand-in OpenAI-compatible server for end-to-end tests. It answers the
// app's four prompt types (resume parse, tailor, email, connection test) and
// deliberately puts banned phrases in first drafts so the Anti-Slop rewrite
// loop is exercised.
import http from 'node:http';

const PORT = Number(process.env.MOCK_LLM_PORT || 4010);
export const calls = [];

const PROFILE = {
  name: 'Divya Sharma', headline: 'Senior Recruiter, Tech and GCC hiring', email: 'divya@example.com', phone: '+91 90000 00000',
  location: 'Bengaluru', linkedin: 'linkedin.com/in/divya', portfolio: '', yearsExperience: 7,
  summary: 'Senior recruiter with 7 years of tech hiring for GCCs and product companies.',
  skills: ['Talent Acquisition', 'Tech Hiring', 'Boolean Search', 'Stakeholder Management', 'LinkedIn Recruiter', 'Greenhouse'],
  experience: [
    { company: 'Capgemini', title: 'Senior Recruiter', location: 'Bengaluru', start: 'Jan 2021', end: '', bullets: ['Closed 120 tech roles in 12 months at 38 days time to fill.', 'Cut agency spend by ₹40 lakh by moving 70% of hires to direct sourcing.'] },
    { company: 'Randstad', title: 'Recruiter', location: 'Bengaluru', start: '2018', end: '2020', bullets: ['Hired 60 engineers for 4 clients.'] },
  ],
  education: [{ school: 'Christ University', degree: 'MBA, HR', start: '2016', end: '2018', details: '' }],
  certifications: [], achievements: [],
};

function answer(system, messages) {
  const rewrite = messages.some((m) => m.role === 'user' && /banned phrases/.test(m.content));
  if (/single word: ready/.test(system)) return 'ready';
  if (/Convert the resume text/.test(system)) return JSON.stringify(PROFILE);
  if (/Tailor the candidate's resume/.test(system)) {
    const r = structuredClone(PROFILE);
    r.headline = 'Senior Talent Acquisition Partner, Tech and GCC hiring';
    r.summary = rewrite
      ? 'Senior recruiter who led 120 tech hires in 12 months for a Bengaluru GCC.'
      : 'Senior recruiter who spearheaded 120 tech hires in 12 months for a Bengaluru GCC.';
    r.notes_for_candidate = ['Confirm the 38-day time to fill figure.'];
    return JSON.stringify(r);
  }
  if (/job-search emails/.test(system)) {
    return JSON.stringify(rewrite
      ? { subject: 'Senior TA Partner role at Acme', body: 'Hi Asha,\n\nI saw the Senior TA Partner opening. I closed 120 tech roles in 12 months at Capgemini.\n\nCould we talk for 10 minutes this week?\n\nDivya' }
      : { subject: 'Senior TA Partner role at Acme', body: 'Hi Asha,\n\nI would love to delve into the Senior TA Partner opening. I closed 120 tech roles in 12 months at Capgemini.\n\nCould we talk for 10 minutes this week?\n\nDivya' });
  }
  return '{}';
}

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    if (req.headers.authorization !== 'Bearer e2e-key') {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end('{"error":"bad key"}');
    }
    const body = JSON.parse(raw || '{}');
    const system = (body.messages || []).find((m) => m.role === 'system')?.content || '';
    calls.push({ url: req.url, model: body.model });
    const content = answer(system, body.messages || []);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ model: body.model, choices: [{ message: { role: 'assistant', content } }], usage: { total_tokens: 10 } }));
  });
}).listen(PORT, () => console.log(`mock LLM on :${PORT}`));
