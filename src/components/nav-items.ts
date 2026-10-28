import { Bell, Briefcase, Columns3, FileText, Globe, Home, LayoutGrid, Lightbulb, Mail, Radar, Settings, UserRound, Wand2 } from 'lucide-react';

export type Item = { href: string; label: string; icon: typeof Home; blurb: string; match: (p: string) => boolean };
export type Group = { id: string; label: string; icon: typeof Home; items: Item[] };

const at = (...paths: string[]) => (p: string) => paths.some((x) => p === x || p.startsWith(`${x}/`));

// The app in five places, in the order of a job search: find jobs, apply,
// track what happens, and you (profile and settings). Each place keeps its
// pages one tap apart in the strip at the top.
export const GROUPS: Group[] = [
  {
    id: 'home', label: 'Home', icon: Home,
    items: [{ href: '/', label: 'Home', icon: Home, blurb: 'Today: what needs you, new matches and progress.', match: (p) => p === '/' }],
  },
  {
    id: 'jobs', label: 'Jobs', icon: Briefcase,
    items: [
      { href: '/jobs', label: 'Jobs', icon: Briefcase, blurb: 'Every job the daily scan found, scored for you.', match: at('/jobs') },
      { href: '/discover', label: 'Discover', icon: Radar, blurb: 'Search the web and ATS boards for roles the scan missed.', match: at('/discover') },
    ],
  },
  {
    id: 'apply', label: 'Apply', icon: Wand2,
    items: [
      { href: '/apply', label: 'Applications', icon: Wand2, blurb: 'Apply with AI: answers, resume and cover letter, ready for your Submit.', match: at('/apply') },
      { href: '/resume', label: 'Resume', icon: FileText, blurb: 'Your master resume and one tailored to any job, as PDF or Word.', match: at('/resume') },
      { href: '/browser', label: 'Browser', icon: Globe, blurb: 'Read a posting, grill it and fill its form side by side.', match: at('/browser') },
    ],
  },
  {
    id: 'track', label: 'Track', icon: Columns3,
    items: [
      { href: '/pipeline', label: 'Pipeline', icon: Columns3, blurb: 'Where every application stands.', match: at('/pipeline') },
      { href: '/mailroom', label: 'Mailroom', icon: Mail, blurb: 'Recruiter emails, LinkedIn notes and follow-ups.', match: at('/mailroom', '/outreach') },
      { href: '/insights', label: 'Insights', icon: Lightbulb, blurb: 'What is working: replies, scores and patterns.', match: at('/insights') },
    ],
  },
  {
    id: 'me', label: 'Me', icon: UserRound,
    items: [
      { href: '/profile', label: 'Profile', icon: UserRound, blurb: 'Your CV, pay, notice period and target roles.', match: at('/profile') },
      { href: '/settings', label: 'Settings', icon: Settings, blurb: 'AI, job search, email and the live self-test.', match: at('/settings') },
      { href: '/notifications', label: 'Alerts', icon: Bell, blurb: 'Everything HunterOps finished or needs you for.', match: at('/notifications') },
      { href: '/more', label: 'All pages', icon: LayoutGrid, blurb: 'Every page in HunterOps on one list.', match: at('/more') },
    ],
  },
];

export const ALL_PAGES: Item[] = GROUPS.flatMap((g) => g.items);
export const groupOf = (pathname: string): Group | undefined => GROUPS.find((g) => g.items.some((i) => i.match(pathname)));
