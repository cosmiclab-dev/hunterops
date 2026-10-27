// Module E: The Designer.
// The single source of the "Switzerland Style" rules in DESIGN.md. The dashboard
// (tailwind.config.ts) and the resume renderer (resume-render.ts) both read these
// tokens, and auditResume() checks every rendered resume against them.

export const DESIGN = {
  fonts: {
    heading: 'Inter',
    body: 'Inter',
    meta: 'Roboto Mono',
  },
  colors: {
    text: '#111111',
    bg: '#FFFFFF',
    border: '#E5E5E5',
  },
  // 4px baseline grid. In print, 1px = 0.75pt, so one grid unit is 3pt.
  gridPx: 4,
  gridPt: 3,
  page: {
    // A4 portrait in points.
    width: 595.28,
    height: 841.89,
    // 24mm on every side.
    marginMm: 24,
    marginPt: (24 / 25.4) * 72,
  },
  // Type scale for print. Every leading is a whole number of grid units.
  type: {
    name: { size: 21, leading: 27 },      // 9 units
    headline: { size: 10.5, leading: 15 }, // 5 units
    section: { size: 8, leading: 12, tracking: 0.08 }, // 4 units, mono caps
    body: { size: 9.75, leading: 15 },     // 5 units
    meta: { size: 8, leading: 12 },        // 4 units, mono
  },
  // Space between blocks, in grid units.
  space: { afterHeader: 4, beforeSection: 5, afterSectionRule: 2, betweenRoles: 3 },
  // Same type in a denser variant: 4-unit body leading.
  compact: { body: { size: 9.25, leading: 12 }, beforeSection: 4, betweenRoles: 2 },
} as const;

export const SECTION_ORDER = ['Summary', 'Skills', 'Experience', 'Education', 'Certifications', 'Achievements'] as const;

export type LayoutStats = {
  pages: number;
  sections: string[];
  // Every y position (pt from the top margin) a line was set on.
  baselines: number[];
  longBullets: { text: string; lines: number }[];
  rolesWithManyBullets: { role: string; bullets: number }[];
  overflowLines: number; // lines that would not fit the target page count
};

export type DesignIssue = { level: 'error' | 'warn'; rule: string; message: string };

// Checks a rendered resume against DESIGN.md. Errors mean the layout broke a
// rule; warnings are editorial (length, bullet count).
export function auditResume(stats: LayoutStats, opts: { yearsExperience?: number | null } = {}): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const offGrid = stats.baselines.filter((y) => Math.abs(y / DESIGN.gridPt - Math.round(y / DESIGN.gridPt)) > 0.01);
  if (offGrid.length) {
    issues.push({ level: 'error', rule: 'grid', message: `${offGrid.length} lines sit off the 4px baseline grid.` });
  }
  const order = stats.sections.map((s) => SECTION_ORDER.indexOf(s as (typeof SECTION_ORDER)[number]));
  if (order.some((v, i) => i > 0 && v < order[i - 1])) {
    issues.push({ level: 'error', rule: 'hierarchy', message: `Sections are out of order: ${stats.sections.join(' > ')}.` });
  }
  const years = opts.yearsExperience ?? null;
  const maxPages = years !== null && years < 8 ? 1 : 2;
  if (stats.pages > maxPages) {
    issues.push({
      level: 'warn',
      rule: 'length',
      message: `${stats.pages} pages; aim for ${maxPages} with ${years ?? 'your'} years of experience. Cut older roles to 1-2 bullets or switch to Compact.`,
    });
  }
  for (const b of stats.longBullets) {
    issues.push({ level: 'warn', rule: 'bullet-length', message: `Bullet runs to ${b.lines} lines: "${b.text.slice(0, 60)}…". Keep bullets to 2 lines.` });
  }
  for (const r of stats.rolesWithManyBullets) {
    issues.push({ level: 'warn', rule: 'bullet-count', message: `${r.role} has ${r.bullets} bullets; 6 is the most a recruiter reads.` });
  }
  return issues;
}

// Snap a value to the grid (used by the renderer for every vertical step).
export const snap = (pt: number) => Math.round(pt / DESIGN.gridPt) * DESIGN.gridPt;
