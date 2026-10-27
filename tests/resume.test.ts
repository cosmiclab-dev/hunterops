import { describe, expect, it } from 'vitest';
import { renderDocx, renderPdf } from '@/lib/resume-render';
import { auditResume, DESIGN } from '@/lib/modules/designer';
import { normalizeResume } from '@/lib/profile';
import { extractText } from '@/lib/extract';

const resume = normalizeResume({
  name: 'Divya Sharma',
  headline: 'Senior Recruiter, Tech and GCC hiring',
  email: 'divya@example.com',
  phone: '+91 90000 00000',
  location: 'Bengaluru',
  summary: 'Senior recruiter with 7 years of tech hiring for GCCs and product companies.',
  skills: ['Talent Acquisition', 'Boolean Search', 'Stakeholder Management'],
  experience: [
    { company: 'Capgemini', title: 'Senior Recruiter', location: 'Bengaluru', start: 'Jan 2021', end: '', bullets: ['Closed 120 tech roles in 12 months at 38 days time to fill.', 'Cut agency spend by ₹40 lakh by moving 70% of hires to direct sourcing.'] },
    { company: 'Randstad', title: 'Recruiter', location: 'Bengaluru', start: '2018', end: '2020', bullets: ['Hired 60 engineers for 4 clients.'] },
  ],
  education: [{ school: 'Christ University', degree: 'MBA, HR', start: '2016', end: '2018' }],
});

describe('Module E: Designer + renderer', () => {
  it('uses 24mm margins and the three colours', () => {
    expect(DESIGN.page.marginPt).toBeCloseTo(68.03, 1);
    expect(DESIGN.colors).toEqual({ text: '#111111', bg: '#FFFFFF', border: '#E5E5E5' });
    for (const t of Object.values(DESIGN.type)) expect(t.leading % DESIGN.gridPt).toBe(0);
  });

  it('renders a one-page PDF on the grid with real, extractable text', async () => {
    const { pdf, stats } = await renderPdf(resume);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(stats.pages).toBe(1);
    expect(stats.sections).toEqual(['Summary', 'Skills', 'Experience', 'Education']);
    expect(auditResume(stats, { yearsExperience: 7 })).toEqual([]);
    const text = await extractText('r.pdf', pdf);
    expect(text).toContain('Divya Sharma');
    expect(text).toContain('Closed 120 tech roles');
    expect(text).toMatch(/Rs\s*40 lakh/);
  });

  it('flags long bullets and page overflow', async () => {
    const long = normalizeResume({
      ...resume,
      experience: Array.from({ length: 8 }, (_, i) => ({
        company: `Co ${i}`, title: 'Recruiter', start: '2010', end: '2011',
        bullets: Array.from({ length: 7 }, () => 'Ran hiring for a large engineering group across many teams and locations with a lot of stakeholders and very long sentences that wrap onto several lines of text in the resume layout, plus more detail about every req, every hiring manager, every offer and every closing call across the full year.'),
      })),
    });
    const { stats } = await renderPdf(long, 'compact');
    const issues = auditResume(stats, { yearsExperience: 5 });
    expect(issues.some((i) => i.rule === 'length')).toBe(true);
    expect(issues.some((i) => i.rule === 'bullet-length')).toBe(true);
    expect(issues.some((i) => i.rule === 'bullet-count')).toBe(true);
    expect(issues.some((i) => i.level === 'error')).toBe(false);
  });

  it('renders a DOCX that reads back', async () => {
    const docx = await renderDocx(resume);
    expect(docx.subarray(0, 2).toString()).toBe('PK');
    const text = await extractText('r.docx', docx);
    expect(text).toContain('Senior Recruiter');
    expect(text).toContain('EXPERIENCE');
  });
});
