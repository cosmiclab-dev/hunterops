// The master profile: shape, normalisation and the plain-text view prompts use.
import type { Profile } from '@prisma/client';
import { prisma } from './db';
import { HttpError } from './http';
import { yearsFromExperience, type GrillProfile } from './modules/grill';

export type Experience = { company: string; title: string; location: string; start: string; end: string; bullets: string[] };
export type Education = { school: string; degree: string; start: string; end: string; details: string };

export type ResumeData = {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio: string;
  summary: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  certifications: string[];
  achievements: string[];
};

export type ProfileInput = ResumeData & {
  yearsExperience: number | null;
  // Job-application facts used by the Grill's salary fit and the Browser's auto-fill.
  expectedSalaryLpa: number | null;
  currentCtcLpa: number | null;
  noticePeriod: string;
  acceptRemote: boolean;
  acceptHybrid: boolean;
  onsiteCities: string[];
};

const asText = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const asList = (v: unknown, max = 30, each = 600) =>
  (Array.isArray(v) ? v : [])
    .map((x) => asText(typeof x === 'string' ? x : (x as { text?: string })?.text ?? '', each))
    .filter(Boolean)
    .slice(0, max);

// Accepts loose input (from the form or the model) and returns clean resume data.
export function normalizeResume(input: any = {}): ResumeData {
  return {
    name: asText(input.name, 200),
    headline: asText(input.headline, 300),
    email: asText(input.email, 200),
    phone: asText(input.phone, 60),
    location: asText(input.location, 200),
    linkedin: asText(input.linkedin, 300),
    portfolio: asText(input.portfolio, 300),
    summary: asText(input.summary, 3000),
    skills: asList(typeof input.skills === 'string' ? input.skills.split(/[,\n]/) : input.skills, 60, 80),
    experience: (Array.isArray(input.experience) ? input.experience : []).slice(0, 20).map((e: any) => ({
      company: asText(e?.company, 200),
      title: asText(e?.title, 200),
      location: asText(e?.location, 200),
      start: asText(e?.start, 40),
      end: asText(e?.end, 40),
      bullets: asList(typeof e?.bullets === 'string' ? e.bullets.split('\n') : e?.bullets, 15, 600),
    })).filter((e: Experience) => e.company || e.title),
    education: (Array.isArray(input.education) ? input.education : []).slice(0, 10).map((e: any) => ({
      school: asText(e?.school, 200),
      degree: asText(e?.degree, 200),
      start: asText(e?.start, 40),
      end: asText(e?.end, 40),
      details: asText(e?.details, 600),
    })).filter((e: Education) => e.school || e.degree),
    certifications: asList(input.certifications, 20, 300),
    achievements: asList(input.achievements, 20, 600),
  };
}

export function normalizeProfile(input: any = {}): ProfileInput {
  const r = normalizeResume(input);
  const yrs = Number(input.yearsExperience ?? input.years);
  const lpa = (v: unknown) => {
    const n = Number(v);
    return v !== null && v !== '' && Number.isFinite(n) && n > 0 && n < 2000 ? Math.round(n * 10) / 10 : null;
  };
  return {
    ...r,
    expectedSalaryLpa: lpa(input.expectedSalaryLpa),
    currentCtcLpa: lpa(input.currentCtcLpa),
    noticePeriod: asText(input.noticePeriod, 60),
    yearsExperience: Number.isFinite(yrs) && yrs > 0 && yrs < 60 ? Math.round(yrs * 10) / 10 : yearsFromExperience(r.experience),
    acceptRemote: input.acceptRemote !== false,
    acceptHybrid: input.acceptHybrid !== false,
    onsiteCities: asList(typeof input.onsiteCities === 'string' ? input.onsiteCities.split(',') : input.onsiteCities ?? ['Bengaluru'], 10, 60),
  };
}

export function profileFromRow(row: Profile): ProfileInput {
  const data = (row.data ?? {}) as any;
  return normalizeProfile({ ...data, ...row, data: undefined });
}

export async function loadProfile(): Promise<ProfileInput | null> {
  const row = await prisma.profile.findUnique({ where: { id: 1 } });
  return row ? profileFromRow(row) : null;
}

export const profileIsEmpty = (p: ProfileInput | null) => !p || (!p.experience.length && !p.summary && !p.skills.length);

export async function requireProfile() {
  const p = await loadProfile();
  if (!p || profileIsEmpty(p)) {
    throw new HttpError(400, 'Set up your profile first: upload your CV on the Home page or the Profile page.');
  }
  return p;
}

export async function saveProfile(input: unknown) {
  const p = normalizeProfile(input);
  const { experience, education, certifications, achievements, expectedSalaryLpa, currentCtcLpa, noticePeriod, ...cols } = p;
  const data = { experience, education, certifications, achievements, expectedSalaryLpa, currentCtcLpa, noticePeriod };
  await prisma.profile.upsert({
    where: { id: 1 },
    create: { id: 1, ...cols, data },
    update: { ...cols, data },
  });
  return p;
}

export function toGrillProfile(p: ProfileInput): GrillProfile {
  return {
    skills: p.skills,
    yearsExperience: p.yearsExperience,
    acceptRemote: p.acceptRemote,
    acceptHybrid: p.acceptHybrid,
    onsiteCities: p.onsiteCities,
    text: profileToText(p),
    expectedSalaryLpa: p.expectedSalaryLpa,
  };
}

// Compact plain-text view of the profile for prompts.
export function profileToText(p: Partial<ProfileInput>) {
  const lines: string[] = [];
  if (p.name) lines.push(`Name: ${p.name}`);
  if (p.headline) lines.push(`Headline: ${p.headline}`);
  if (p.location) lines.push(`Location: ${p.location}`);
  if (p.yearsExperience) lines.push(`Years of experience: ${p.yearsExperience}`);
  if (p.summary) lines.push(`Summary: ${p.summary}`);
  if (p.skills?.length) lines.push(`Skills: ${p.skills.join(', ')}`);
  for (const e of p.experience || []) {
    lines.push(`\n${e.title} at ${e.company} (${[e.start, e.end || 'present'].filter(Boolean).join(' - ')})${e.location ? `, ${e.location}` : ''}`);
    for (const b of e.bullets) lines.push(`- ${b}`);
  }
  for (const ed of p.education || []) lines.push(`Education: ${[ed.degree, ed.school, ed.end].filter(Boolean).join(', ')}`);
  if (p.certifications?.length) lines.push(`Certifications: ${p.certifications.join('; ')}`);
  if (p.achievements?.length) lines.push(`Achievements: ${p.achievements.join('; ')}`);
  return lines.join('\n');
}
