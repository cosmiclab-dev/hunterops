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
  if (/auditing a Senior Recruiter's CV/.test(system)) {
    return JSON.stringify({
      critique: [
        { original: 'Responsible for end-to-end recruitment for IT roles.', why_rejected: 'Duty language with no volume, channel or outcome.', verdict: 'Rewrite', rewrite: 'Closed [N] cloud and data requisitions a quarter for India delivery units, 70% through direct sourcing, at [X] days time to fill.' },
        { original: 'Handled stakeholder meetings and candidate screening.', why_rejected: 'Describes meetings, not results.', verdict: 'Rewrite', rewrite: 'Ran weekly hiring reviews with 6 delivery directors, cutting interview-to-offer time from [X] to [Y] days.' },
      ],
      rewrites: [
        { focus: 'Direct-sourcing efficiency and vendor spend', bullet: 'Moved 70% of hires to direct sourcing with Boolean and GitHub mapping, cutting agency spend by ₹40 lakh a year.' },
        { focus: 'Volume, pipeline velocity and Time-to-Fill', bullet: 'Closed 120 tech roles in 12 months at a 38-day average time to fill.' },
        { focus: 'Niche or high-attrition pipelining and Offer-to-Join', bullet: 'Kept a 300-profile niche cloud pipeline warm, lifting Offer-to-Join to [Y]%.' },
        { focus: 'Business partner and delivery-director stakeholder management', bullet: 'Partnered with Practice Heads to forecast quarterly demand across 4 service lines.' },
        { focus: 'Sourcing tools, talent mapping and pipeline governance', bullet: 'Built weekly funnel dashboards in Excel for 6 hiring managers, flagging stalled reqs within 48 hours.' },
      ],
      summary: 'Senior Recruiter with 7 years of full-cycle tech hiring at Capgemini scale. Deep direct-sourcing depth in cloud and data talent for GCCs. Available to join immediately with a 0-day notice period for Q4 and Q1 backlogs.',
      weak_phrases: ['Responsible for', 'Handled'],
    });
  }
  if (/short LinkedIn messages for a Senior Recruiter/.test(system)) {
    return JSON.stringify({
      head_of_ta: 'Hi Asha, saw the Senior TA Partner opening at Acme. At Capgemini I closed 120 tech roles in 12 months at 38 days time to fill. I can join on day one with no notice period. Open to a 10-minute call this week? Divya',
      peer_referral: 'Hi Ravi, hope Acme is treating you well. I saw the Senior TA Partner req. I closed 120 tech roles at Capgemini and can start immediately. Would you be comfortable referring me? Happy to send a 3-line blurb. Divya',
      practice_head: 'Hi Meera, your cloud practice looks busy with new reqs. I ran direct sourcing for Capgemini delivery teams, 70% without agencies. I can start Monday with zero notice. Worth a quick call about your hiring backlog? Divya',
    });
  }
  if (/fill in job application questions/.test(system)) {
    const user = messages.find((m) => m.role === 'user')?.content || '';
    const keys = [...user.matchAll(/key "([^"]+)"/g)].map((m) => m[1]);
    const answers = {};
    for (const k of keys) {
      const line = user.split('\n').find((l) => l.includes(`key "${k}"`)) || '';
      const opts = line.match(/\(options: (.+)\)/);
      answers[k] = opts ? opts[1].split(' | ')[0] : 'Your GCC is scaling tech hiring, which is the work I led at Capgemini: 120 tech roles in 12 months at 38 days time to fill.';
    }
    return JSON.stringify({ answers });
  }
  if (/ASD-STE100/.test(system)) {
    return 'I led tech hiring at Capgemini. We hired 120 engineers in 12 months.';
  }
  if (/explaining a career gap/.test(system)) {
    return JSON.stringify({
      email: 'Since November 2025 I have taken a planned break after five years of high-volume hiring at Capgemini. I used the time to get hands-on with AI-assisted sourcing and market mapping. I can join immediately with no notice period.',
      phone: 'After Capgemini I took a planned break from November 2025. I spent it learning AI sourcing tools and mapping the Bengaluru GCC market. The upside for you is that I can start right away. Most candidates you speak to will be on 60 to 90 days notice.',
    });
  }
  if (/You coach a senior talent-acquisition professional/.test(system)) {
    const user = messages.find((m) => m.role === 'user')?.content || '';
    const firstJob = user.match(/ACTIVE JOBS:\n([0-9a-f-]{36}) \|/)?.[1] || '';
    const long = 'Hi Meera, I am a Senior Recruiter with five years of tech hiring at Capgemini, based in Bengaluru and able to join immediately. I hired 120 engineers in 12 months for a GCC ramp. Happy to share my CV if this fits what you need for the TA Partner role right now, and to talk through how I would run the Bengaluru pipeline.';
    return JSON.stringify({
      summary: 'Mock coaching output.',
      sections: [
        { heading: 'Main', items: [{ title: 'Point', text: 'Use the 120-engineer ramp story.', tag: 'inferred from JD' }, { text: long, copy: true }] },
      ],
      titles: ['Talent Partner', 'TA Business Partner'],
      kind: 'interview_invite', jobId: firstJob, status: firstJob ? 'INTERVIEW' : '',
    });
  }
  if (/full A-H evaluation/.test(system)) {
    return JSON.stringify({
      archetype: { name: 'Tech hiring partner', targeted: true, why: 'Senior TA partner for a GCC.' },
      summary: { domain: 'Tech hiring', function: 'Individual partner', seniority: 'Senior', workMode: 'Hybrid, Bengaluru', teamSize: '', culture: { verdict: 'caution', evidence: 'No team or interview process described.' }, tldr: 'Senior TA partner hiring engineers for a Bengaluru GCC.' },
      flags: [],
      match: {
        rows: [
          { requirement: 'Workday', importance: 'preferred', tier: 'structural', match: 'missing', jdSignal: 'Nice to have', evidence: 'Not in profile.' },
          { requirement: 'Market intel', importance: 'critical', tier: 'inferred', match: 'partial', jdSignal: 'made up', evidence: 'Some mapping work.' },
          { requirement: '6+ years of tech hiring', importance: 'critical', tier: 'stated', match: 'strong', jdSignal: '6+ years of experience in tech hiring', evidence: 'Senior Recruiter at Capgemini since 2020.' },
        ],
        dropped: 2,
        gaps: [{ requirement: 'Workday', blocker: false, risk: 'They may ask about ATS admin.', mitigation: 'Mention Greenhouse and SuccessFactors use.' }],
      },
      level: { detected: 'Senior IC', natural: 'Senior IC', sellSenior: ['Lead with the 120 engineers hired in 12 months.'], ifDownleveled: ['Ask for a 6-month review.'] },
      comp: { companyType: 'MNC / GCC', reliability: 'medium', advertised: 'CTC 22-30 LPA', notes: ['CTC usually includes variable pay.'], hrQuestions: ['What is the fixed part of the CTC?'], demand: 'Steady demand for GCC tech hiring in Bengaluru.' },
      plan: { cv: [{ section: 'Summary', change: 'Open with GCC tech hiring.', why: 'Mirrors the JD.' }], linkedin: [{ section: 'Headline', change: 'Senior TA Partner, tech and GCC hiring', why: 'Search match.' }] },
      interview: {
        stories: [{ requirement: 'Tech hiring at scale', theme: 'Scale', title: 'Hiring 120 engineers in 12 months', situation: 'Capgemini needed engineers fast.', task: 'Own the pipeline.', action: 'Ran weekly intake and Boolean sourcing.', result: '120 hires in 12 months.', reflection: 'Would set up referrals earlier.', bestFor: 'Volume, pressure' }],
        caseStudy: 'The 120-engineer ramp.',
        hardQuestions: [{ question: 'What have you done since November 2025?', answer: 'A planned break; I learned AI sourcing tools.' }],
      },
      legitimacy: { tier: 'high', observations: ['Recent posting with specific requirements.'] },
      dimensions: { cv: 4.5, northStar: 4, comp: 4, culture: 3, redFlags: 4 },
      evidence: { cv: 'supported', northStar: 'supported', comp: 'partial', culture: 'partial', redFlags: 'supported' },
      score: 4.2, confidence: 'high', confidenceGaps: ['Confirm the fixed part of the CTC.'],
      verdict: { apply: true, headline: 'Worth applying this week', why: 'Strong match on tech hiring scale.' },
      risks: ['Hybrid three days a week.'],
      answers: [{ question: 'Notice period', answer: 'I can join immediately.' }],
      keywords: ['tech hiring', 'Boolean search', 'stakeholder management'],
    });
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
