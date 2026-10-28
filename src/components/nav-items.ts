import { Briefcase, Columns3, Ellipsis, Globe, Home, Lightbulb, Mail, Radar, Settings, UserRound, Wand2 } from 'lucide-react';

export type Item = { href: string; label: string; icon: typeof Home; match: (p: string) => boolean };

// The everyday loop: find jobs, apply, track. Everything else sits one tap away.
export const MAIN: Item[] = [
  { href: '/', label: 'Home', icon: Home, match: (p) => p === '/' },
  { href: '/jobs', label: 'Jobs', icon: Briefcase, match: (p) => p.startsWith('/jobs') },
  { href: '/apply', label: 'Apply', icon: Wand2, match: (p) => p.startsWith('/apply') },
  { href: '/pipeline', label: 'Pipeline', icon: Columns3, match: (p) => p.startsWith('/pipeline') },
];
export const MORE: (Item & { blurb: string })[] = [
  { href: '/discover', label: 'Discover', icon: Radar, blurb: 'Search the web and ATS boards for roles the scan missed.', match: (p) => p.startsWith('/discover') },
  { href: '/mailroom', label: 'Mailroom', icon: Mail, blurb: 'Recruiter emails, LinkedIn notes and follow-ups.', match: (p) => p.startsWith('/mailroom') || p.startsWith('/outreach') },
  { href: '/browser', label: 'Browser', icon: Globe, blurb: 'Read a posting, grill it and fill its form side by side.', match: (p) => p.startsWith('/browser') },
  { href: '/insights', label: 'Insights', icon: Lightbulb, blurb: 'What is working: replies, scores and patterns.', match: (p) => p.startsWith('/insights') },
  { href: '/profile', label: 'Profile', icon: UserRound, blurb: 'Your CV, pay, notice period and target roles.', match: (p) => p.startsWith('/profile') },
  { href: '/settings', label: 'Settings', icon: Settings, blurb: 'AI, job search, email and the live self-test.', match: (p) => p.startsWith('/settings') },
];
export const MORE_TAB: Item = { href: '/more', label: 'More', icon: Ellipsis, match: (p) => p === '/more' || MORE.some((i) => i.match(p)) };
