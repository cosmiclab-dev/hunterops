import { describe, expect, it } from 'vitest';
import { GRILL_WEIGHTS, grill, grillBand, parseYearsRequirement, splitJd, termInText, type GrillProfile } from '@/lib/modules/grill';

const profile: GrillProfile = {
  skills: ['Talent Acquisition', 'Tech Hiring', 'Boolean Search', 'Stakeholder Management', 'LinkedIn Recruiter', 'Greenhouse', 'Excel'],
  yearsExperience: 7,
  acceptRemote: true,
  acceptHybrid: true,
  onsiteCities: ['Bengaluru'],
  text: 'Senior recruiter. Built GCC hiring from zero. Used Workday and Power BI dashboards.',
};

const JD = `Senior Talent Acquisition Partner
Requirements
- 5+ years of experience in tech hiring
- Strong boolean search and LinkedIn Recruiter skills
- Stakeholder management with engineering leaders
- Experience with Greenhouse ATS
Nice to have
- Experience setting up a GCC
- Power BI dashboards
- Campus hiring`;

describe('Module D: The Grill', () => {
  it('uses the agreed weights', () => {
    expect(GRILL_WEIGHTS).toEqual({ skills: 40, location: 20, experience: 20, keywords: 20 });
  });

  it('bands scores: red < 50, yellow < 75, green 75+', () => {
    expect(grillBand(0)).toBe('red');
    expect(grillBand(49)).toBe('red');
    expect(grillBand(50)).toBe('yellow');
    expect(grillBand(74)).toBe('yellow');
    expect(grillBand(75)).toBe('green');
    expect(grillBand(100)).toBe('green');
  });

  it('splits required and nice-to-have sections', () => {
    const s = splitJd(JD);
    expect(s.hasNiceSection).toBe(true);
    expect(s.nice).toContain('Power BI');
    expect(s.required).toContain('boolean search');
    expect(s.required).not.toContain('Power BI');
  });

  it('parses years requirements', () => {
    expect(parseYearsRequirement('5+ years of experience')).toEqual({ min: 5, max: null });
    expect(parseYearsRequirement('3-6 yrs in recruitment')).toEqual({ min: 3, max: 6 });
    expect(parseYearsRequirement('Founded 20 years ago. Minimum of 8 years experience.')).toEqual({ min: 8, max: null });
    expect(parseYearsRequirement('No requirement here')).toBeNull();
  });

  it('matches whole terms only', () => {
    expect(termInText('java', 'we use javascript')).toBe(false);
    expect(termInText('java', 'java and spring')).toBe(true);
    expect(termInText('talent acquisition', 'TA partner')).toBe(true);
  });

  it('scores a strong Bengaluru match green', () => {
    const g = grill(profile, { title: 'Senior Talent Acquisition Partner', location: 'Bengaluru, India', description: JD });
    expect(g.location.score).toBe(20);
    expect(g.experience.score).toBe(20);
    expect(g.skills.score).toBeGreaterThanOrEqual(30);
    expect(g.keywords.source).toBe('nice_to_have');
    expect(g.keywords.matched).toEqual(expect.arrayContaining(['gcc', 'power bi']));
    expect(g.score).toBeGreaterThanOrEqual(75);
    expect(g.band).toBe('green');
    expect(g.score).toBe(Math.round(g.skills.score + g.location.score + g.experience.score + g.keywords.score));
  });

  it('is strict on location', () => {
    const mumbai = grill(profile, { title: 'Recruiter', location: 'Mumbai, India', description: JD });
    expect(mumbai.location.score).toBe(0);
    const usRemote = grill(profile, { title: 'Recruiter', location: 'Remote - US', description: JD });
    expect(usRemote.location.workMode).toBe('REMOTE');
    expect(usRemote.location.score).toBe(0);
    const indiaRemote = grill(profile, { title: 'Recruiter', location: 'Remote, India', description: JD });
    expect(indiaRemote.location.score).toBe(20);
    const noRemote = grill({ ...profile, acceptRemote: false }, { title: 'Recruiter', location: 'Remote', description: JD });
    expect(noRemote.location.score).toBe(0);
    const hybridBlr = grill({ ...profile, acceptHybrid: false }, { title: 'Recruiter', location: 'Bangalore (Hybrid)', description: JD });
    expect(hybridBlr.location.score).toBe(0);
  });

  it('gives partial experience credit below the minimum', () => {
    const g = grill({ ...profile, yearsExperience: 4 }, { title: 'Recruiter', location: 'Bengaluru', description: 'Requirements\n- 8+ years of recruiting experience' });
    expect(g.experience.score).toBe(0);
    const g2 = grill({ ...profile, yearsExperience: 6 }, { title: 'Recruiter', location: 'Bengaluru', description: 'Requirements\n- 8+ years of recruiting experience' });
    expect(g2.experience.score).toBe(10);
  });

  it('scores a weak, wrong-city match red', () => {
    const g = grill({ ...profile, skills: ['Excel'], yearsExperience: 2 }, { title: 'Head of Talent', location: 'London, UK', description: JD });
    expect(g.band).toBe('red');
  });
});
