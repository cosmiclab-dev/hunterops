// A no-AI reading of a resume: contact details, skills the Grill knows and
// total years. Used when the AI provider is slow or not set up, so the first
// CV upload always produces a usable profile.
import { SKILL_LEXICON, extractTerms } from './modules/grill';

export function heuristicProfile(text: string) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? '';
  const phone = text.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|\+\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/)?.[0] ?? '';
  const linkedin = text.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[\w-]+\/?/i)?.[0] ?? '';
  const name = lines.find((l) => /^[A-Za-z][A-Za-z.' -]{2,40}$/.test(l) && l.split(/\s+/).length <= 4 && !/resume|curriculum|vitae|profile/i.test(l)) ?? '';
  const years = [...text.matchAll(/(\d{1,2}(?:\.\d)?)\+?\s*(?:years|yrs)/gi)].map((m) => Number(m[1])).filter((n) => n > 0 && n < 45);
  const location = text.match(/\b(Bengaluru|Bangalore|Hyderabad|Pune|Chennai|Mumbai|Gurugram|Gurgaon|Noida|Delhi|Kolkata)\b/i)?.[0] ?? '';
  const summaryStart = lines.findIndex((l) => /^(summary|profile|about me|professional summary|career objective)\b/i.test(l));
  const summary = summaryStart >= 0 ? lines.slice(summaryStart + 1, summaryStart + 4).join(' ').slice(0, 800) : '';
  return {
    name,
    headline: lines[1] && lines[1] !== name && lines[1].length < 120 ? lines[1] : '',
    email,
    phone,
    linkedin,
    location,
    summary,
    yearsExperience: years.length ? Math.max(...years) : null,
    skills: extractTerms(text, SKILL_LEXICON).slice(0, 40),
    experience: [],
    education: [],
    certifications: [],
    achievements: [],
  };
}
