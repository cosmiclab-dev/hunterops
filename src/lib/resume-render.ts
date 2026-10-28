// Resume rendering to PDF (pdf-lib) and DOCX (docx), both in the Switzerland
// Style from DESIGN.md: Inter + Roboto Mono, 4px grid, three colours, single
// column, 24mm margins. Real text, standard section names, no tables, so ATS
// parsers read it cleanly.
import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  BorderStyle, Document, ExternalHyperlink, LineRuleType, Packer, Paragraph, TabStopType, TextRun,
} from 'docx';
import { DESIGN, snap, type LayoutStats } from './modules/designer';
import type { ResumeData } from './profile';

export type Density = 'standard' | 'compact';
export const DENSITIES: Record<Density, string> = {
  standard: 'Standard (15pt leading)',
  compact: 'Compact (fits more on a page)',
};

const dates = (e: { start?: string; end?: string }) => [e.start, e.end || (e.start ? 'Present' : '')].filter(Boolean).join(' – ');
const contactLine = (r: ResumeData) => [r.location, r.phone, r.email, r.linkedin, r.portfolio].filter(Boolean);

type Section =
  | { title: string; kind: 'text'; text: string }
  | { title: string; kind: 'experience'; items: ResumeData['experience'] }
  | { title: string; kind: 'education'; items: ResumeData['education'] }
  | { title: string; kind: 'bullets'; items: string[] };

function sections(r: ResumeData): Section[] {
  const out: Section[] = [];
  if (r.summary) out.push({ title: 'Summary', kind: 'text', text: r.summary });
  if (r.skills.length) out.push({ title: 'Skills', kind: 'text', text: r.skills.join(' · ') });
  if (r.experience.length) out.push({ title: 'Experience', kind: 'experience', items: r.experience });
  if (r.education.length) out.push({ title: 'Education', kind: 'education', items: r.education });
  if (r.certifications.length) out.push({ title: 'Certifications', kind: 'bullets', items: r.certifications });
  if (r.achievements.length) out.push({ title: 'Achievements', kind: 'bullets', items: r.achievements });
  return out;
}

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

// ---- PDF ---------------------------------------------------------------------------

const FONT_FILES = {
  regular: 'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff',
  semibold: 'node_modules/@fontsource/inter/files/inter-latin-600-normal.woff',
  bold: 'node_modules/@fontsource/inter/files/inter-latin-700-normal.woff',
  mono: 'node_modules/@fontsource/roboto-mono/files/roboto-mono-latin-400-normal.woff',
};

async function loadFonts(pdf: PDFDocument) {
  try {
    pdf.registerFontkit(fontkit);
    const read = (p: string) => fs.readFile(path.join(process.cwd(), p));
    const [regular, semibold, bold, mono] = await Promise.all(
      [FONT_FILES.regular, FONT_FILES.semibold, FONT_FILES.bold, FONT_FILES.mono].map(async (f) => pdf.embedFont(await read(f), { subset: true })),
    );
    return { regular, semibold, bold, mono, custom: true };
  } catch (err) {
    // Fonts missing from the deployment: fall back to the standard PDF faces.
    console.warn('[resume] Inter/Roboto Mono not found, using Helvetica/Courier', (err as Error).message);
    const [regular, bold, mono] = await Promise.all([
      pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold), pdf.embedFont(StandardFonts.Courier),
    ]);
    return { regular, semibold: bold, bold, mono, custom: false };
  }
}

// The Latin subsets cover English text; swap common symbols they lack and drop the rest.
const SWAPS: Record<string, string> = { '₹': 'Rs ', '→': '->', '←': '<-', '✓': '-', '≥': '>=', '≤': '<=', ' ': ' ', '\t': ' ' };
// Letters with no decomposed form, for fonts that lack them.
const FOLD: Record<string, string> = { 'Ł': 'L', 'ł': 'l', 'Ø': 'O', 'ø': 'o', 'Đ': 'D', 'đ': 'd', 'ß': 'ss', 'Æ': 'AE', 'æ': 'ae', 'Œ': 'OE', 'œ': 'oe', 'ı': 'i' };
function safeText(font: PDFFont, text: string) {
  const fk = (font as any).embedder?.font;
  let out = '';
  for (const ch of String(text || '').replace(/[\r\n]+/g, ' ')) {
    const c = SWAPS[ch] ?? ch;
    if (fk?.hasGlyphForCodePoint) {
      const has = (t: string) => [...t].every((x) => fk.hasGlyphForCodePoint(x.codePointAt(0)));
      // A letter the font lacks ("Ł") falls back to its plain form ("L") instead of vanishing.
      const plain = (FOLD[c] ?? c.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''));
      out += has(c) ? c : plain && has(plain) ? plain : '';
    } else {
      try {
        font.encodeText(c);
        out += c;
      } catch { /* not encodable in WinAnsi */ }
    }
  }
  return out;
}

export async function renderPdf(r: ResumeData, density: Density = 'standard'): Promise<{ pdf: Buffer; stats: LayoutStats }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${r.name || 'Resume'} - Resume`);
  pdf.setAuthor(r.name || '');
  pdf.setCreator('HunterOps');
  const f = await loadFonts(pdf);
  const ink = hexToRgb(DESIGN.colors.text);
  const rule = hexToRgb(DESIGN.colors.border);
  const { width: W, height: H, marginPt: M } = DESIGN.page;
  const colW = W - 2 * M;
  const T = DESIGN.type;
  const body = density === 'compact' ? DESIGN.compact.body : T.body;
  const g = DESIGN.gridPt;
  const beforeSection = (density === 'compact' ? DESIGN.compact.beforeSection : DESIGN.space.beforeSection) * g;
  const betweenRoles = (density === 'compact' ? DESIGN.compact.betweenRoles : DESIGN.space.betweenRoles) * g;
  const usable = snap(H - 2 * M - g); // keep the last line inside the bottom margin

  const stats: LayoutStats = { pages: 1, sections: [], baselines: [], longBullets: [], rolesWithManyBullets: [], overflowLines: 0 };
  let page: PDFPage = pdf.addPage([W, H]);
  let cursor = 0; // distance below the top margin, always on the grid

  const ensure = (h: number) => {
    if (cursor + h > usable) {
      page = pdf.addPage([W, H]);
      stats.pages++;
      cursor = 0;
    }
  };
  // Places one line whose box is `leading` tall; the baseline sits at 80% of the box.
  const setLine = (text: string, font: PDFFont, size: number, leading: number, x = M, color = ink) => {
    ensure(leading);
    stats.baselines.push(cursor);
    const baseline = H - M - cursor - Math.round(leading * 0.5 + size * 0.35);
    page.drawText(text, { x, y: baseline, size, font, color });
    cursor += leading;
  };
  const wrap = (text: string, font: PDFFont, size: number, maxW: number) => {
    const words = safeText(font, text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= maxW || !line) line = next;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const para = (text: string, font: PDFFont, size: number, leading: number, x = M, maxW = colW) => {
    const lines = wrap(text, font, size, maxW);
    for (const ln of lines) setLine(ln, font, size, leading, x);
    return lines.length;
  };
  // Left text in `lf`, right text in mono metadata style, same grid line.
  const leftRight = (left: string, right: string, lf: PDFFont, size: number, leading: number) => {
    ensure(leading);
    const rt = safeText(f.mono, right);
    const rw = f.mono.widthOfTextAtSize(rt, T.meta.size);
    // A long title wraps under itself; the dates stay on the first line.
    const [first = '', ...rest] = wrap(left, lf, size, colW - rw - 12);
    stats.baselines.push(cursor);
    const baseline = H - M - cursor - Math.round(leading * 0.5 + size * 0.35);
    page.drawText(first, { x: M, y: baseline, size, font: lf, color: ink });
    if (rt) page.drawText(rt, { x: M + colW - rw, y: baseline, size: T.meta.size, font: f.mono, color: ink });
    cursor += leading;
    if (rest.length) for (const ln of wrap(rest.join(' '), lf, size, colW - rw - 12)) setLine(ln, lf, size, leading);
  };

  // Header: name, headline, mono contact line. Flush left.
  para(r.name || 'Your Name', f.bold, T.name.size, T.name.leading);
  if (r.headline) para(r.headline, f.regular, T.headline.size, T.headline.leading);
  const contacts = contactLine(r);
  if (contacts.length) para(contacts.join('  /  '), f.mono, T.meta.size, T.meta.leading);
  cursor += DESIGN.space.afterHeader * g - beforeSection;

  for (const s of sections(r)) {
    cursor += beforeSection;
    ensure(T.section.leading + body.leading * 2);
    stats.sections.push(s.title);
    const label = s.title.toUpperCase().split('').join(' '); // hair-space tracking
    setLine(safeText(f.mono, label) || s.title.toUpperCase(), f.mono, T.section.size, T.section.leading);
    const ruleY = H - M - cursor + 1;
    page.drawLine({ start: { x: M, y: ruleY }, end: { x: M + colW, y: ruleY }, thickness: 0.5, color: rule });
    cursor += DESIGN.space.afterSectionRule * g;

    if (s.kind === 'text') para(s.text, f.regular, body.size, body.leading);
    else if (s.kind === 'experience') {
      s.items.forEach((e, i) => {
        if (i) cursor += betweenRoles;
        ensure(body.leading + T.meta.leading + body.leading);
        leftRight(e.title || '', dates(e), f.semibold, body.size, body.leading);
        para([e.company, e.location].filter(Boolean).join(' / '), f.mono, T.meta.size, T.meta.leading);
        if (e.bullets.length > 6) stats.rolesWithManyBullets.push({ role: `${e.title} at ${e.company}`, bullets: e.bullets.length });
        for (const b of e.bullets) bullet(b);
      });
    } else if (s.kind === 'education') {
      for (const e of s.items) {
        leftRight([e.degree, e.school].filter(Boolean).join(', '), dates(e), f.semibold, body.size, body.leading);
        if (e.details) para(e.details, f.regular, body.size, body.leading);
      }
    } else {
      for (const b of s.items) bullet(b);
    }
  }

  function bullet(text: string) {
    const indent = 12;
    const lines = wrap(text, f.regular, body.size, colW - indent);
    if (lines.length > 2) stats.longBullets.push({ text, lines: lines.length });
    lines.forEach((ln, i) => {
      ensure(body.leading);
      if (i === 0) {
        const baseline = H - M - cursor - Math.round(body.leading * 0.5 + body.size * 0.35);
        page.drawText('–', { x: M, y: baseline, size: body.size, font: f.regular, color: ink });
      }
      setLine(ln, f.regular, body.size, body.leading, M + indent);
    });
  }

  return { pdf: Buffer.from(await pdf.save()), stats };
}

// ---- DOCX ---------------------------------------------------------------------------

const twips = (pt: number) => Math.round(pt * 20);
const half = (pt: number) => Math.round(pt * 2);

export async function renderDocx(r: ResumeData, density: Density = 'standard'): Promise<Buffer> {
  const T = DESIGN.type;
  const g = DESIGN.gridPt;
  const body = density === 'compact' ? DESIGN.compact.body : T.body;
  const beforeSection = (density === 'compact' ? DESIGN.compact.beforeSection : DESIGN.space.beforeSection) * g;
  const betweenRoles = (density === 'compact' ? DESIGN.compact.betweenRoles : DESIGN.space.betweenRoles) * g;
  const marginTw = Math.round((DESIGN.page.marginMm / 25.4) * 1440);
  const pageW = 11906; // A4 in twips
  const tab = { type: TabStopType.RIGHT, position: pageW - 2 * marginTw };
  const exact = (leading: number, before = 0, after = 0) => ({
    line: twips(leading), lineRule: LineRuleType.EXACT, before: twips(before), after: twips(after),
  });
  const inter = (text: string, size: number, opts: { bold?: boolean } = {}) =>
    new TextRun({ text, size: half(size), font: DESIGN.fonts.body, color: DESIGN.colors.text.slice(1), bold: opts.bold });
  const mono = (text: string, size = T.meta.size) =>
    new TextRun({ text, size: half(size), font: DESIGN.fonts.meta, color: DESIGN.colors.text.slice(1) });

  const children: Paragraph[] = [];
  children.push(new Paragraph({ spacing: exact(T.name.leading), children: [inter(r.name || 'Your Name', T.name.size, { bold: true })] }));
  if (r.headline) children.push(new Paragraph({ spacing: exact(T.headline.leading), children: [inter(r.headline, T.headline.size)] }));
  const contacts = contactLine(r);
  if (contacts.length) {
    const runs: (TextRun | ExternalHyperlink)[] = [];
    contacts.forEach((c, i) => {
      if (i) runs.push(mono('  /  '));
      const link = /^https?:\/\//.test(c) ? c : c.includes('linkedin.com') ? `https://${c.replace(/^\/+/, '')}` : null;
      runs.push(link ? new ExternalHyperlink({ link, children: [mono(c)] }) : mono(c));
    });
    children.push(new Paragraph({ spacing: exact(T.meta.leading, 0, Math.max(0, DESIGN.space.afterHeader * g - beforeSection)), children: runs }));
  }

  const heading = (text: string) => new Paragraph({
    spacing: exact(T.section.leading, beforeSection, DESIGN.space.afterSectionRule * g),
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: DESIGN.colors.border.slice(1), space: 1 } },
    children: [new TextRun({ text: text.toUpperCase(), size: half(T.section.size), font: DESIGN.fonts.meta, characterSpacing: 16, color: DESIGN.colors.text.slice(1) })],
  });
  const bullet = (text: string) => new Paragraph({
    spacing: exact(body.leading),
    indent: { left: 240, hanging: 240 },
    children: [inter(`–\t${text}`, body.size)],
    tabStops: [{ type: TabStopType.LEFT, position: 240 }],
  });

  for (const s of sections(r)) {
    children.push(heading(s.title));
    if (s.kind === 'text') {
      children.push(new Paragraph({ spacing: exact(body.leading), children: [inter(s.text, body.size)] }));
    } else if (s.kind === 'experience') {
      s.items.forEach((e, i) => {
        children.push(new Paragraph({
          tabStops: [tab],
          spacing: exact(body.leading, i ? betweenRoles : 0),
          children: [inter(e.title || '', body.size, { bold: true }), mono(`\t${dates(e)}`)],
        }));
        children.push(new Paragraph({ spacing: exact(T.meta.leading), children: [mono([e.company, e.location].filter(Boolean).join(' / '))] }));
        for (const b of e.bullets) children.push(bullet(b));
      });
    } else if (s.kind === 'education') {
      for (const e of s.items) {
        children.push(new Paragraph({
          tabStops: [tab],
          spacing: exact(body.leading),
          children: [inter([e.degree, e.school].filter(Boolean).join(', '), body.size, { bold: true }), mono(`\t${dates(e)}`)],
        }));
        if (e.details) children.push(new Paragraph({ spacing: exact(body.leading), children: [inter(e.details, body.size)] }));
      }
    } else {
      for (const b of s.items) children.push(bullet(b));
    }
  }

  const doc = new Document({
    creator: r.name || 'HunterOps',
    title: `${r.name || 'Resume'} - Resume`,
    styles: { default: { document: { run: { font: DESIGN.fonts.body, size: half(body.size) } } } },
    sections: [{
      properties: {
        page: {
          size: { width: pageW, height: 16838 },
          margin: { top: marginTw, bottom: marginTw, left: marginTw, right: marginTw },
        },
      },
      children,
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

