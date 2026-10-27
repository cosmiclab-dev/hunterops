// Resume rendering to DOCX (docx) and PDF (pdf-lib). Single column, real text,
// standard section names and no tables or graphics, so ATS parsers read it cleanly.
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, TabStopType, ExternalHyperlink,
} from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const TEMPLATES = {
  classic: { label: 'Classic (serif, centered header)', docxFont: 'Times New Roman', pdf: 'times', size: 10.5, accent: [0, 0, 0], centered: true },
  modern: { label: 'Modern (sans, accent color)', docxFont: 'Calibri', pdf: 'helvetica', size: 10, accent: [0.11, 0.25, 0.47], centered: false },
  compact: { label: 'Compact (fits more on one page)', docxFont: 'Arial', pdf: 'helvetica', size: 9.5, accent: [0.2, 0.2, 0.2], centered: false, tight: true },
};

const hex = (c) => c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const dates = (e) => [e.start, e.end || (e.start ? 'Present' : '')].filter(Boolean).join(' – ');
const contactLine = (r) => [r.location, r.phone, r.email, r.linkedin, r.portfolio].filter(Boolean);

function sections(r) {
  const out = [];
  if (r.summary) out.push({ title: 'Summary', kind: 'text', text: r.summary });
  if (r.skills?.length) out.push({ title: 'Skills', kind: 'text', text: r.skills.join(' • ') });
  if (r.experience?.length) out.push({ title: 'Experience', kind: 'experience', items: r.experience });
  if (r.education?.length) out.push({ title: 'Education', kind: 'education', items: r.education });
  if (r.certifications?.length) out.push({ title: 'Certifications', kind: 'bullets', items: r.certifications });
  if (r.achievements?.length) out.push({ title: 'Achievements', kind: 'bullets', items: r.achievements });
  return out;
}

// ---- DOCX --------------------------------------------------------------------

export async function renderDocx(r, templateKey = 'classic') {
  const t = TEMPLATES[templateKey] || TEMPLATES.classic;
  const half = Math.round(t.size * 2);
  const accent = hex(t.accent);
  const gap = t.tight ? 40 : 80;
  const children = [];

  children.push(new Paragraph({
    alignment: t.centered ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: 40 },
    children: [new TextRun({ text: r.name || 'Your Name', bold: true, size: half + 18, color: accent })],
  }));
  if (r.headline) {
    children.push(new Paragraph({
      alignment: t.centered ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { after: 40 },
      children: [new TextRun({ text: r.headline, size: half + 2 })],
    }));
  }
  const contacts = contactLine(r);
  if (contacts.length) {
    const runs = [];
    contacts.forEach((c, i) => {
      if (i) runs.push(new TextRun({ text: '  |  ', size: half - 1 }));
      const link = /^https?:\/\//.test(c) ? c : c.includes('linkedin.com') ? `https://${c.replace(/^\/+/, '')}` : null;
      runs.push(link
        ? new ExternalHyperlink({ link, children: [new TextRun({ text: c, size: half - 1 })] })
        : new TextRun({ text: c, size: half - 1 }));
    });
    children.push(new Paragraph({ alignment: t.centered ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { after: 120 }, children: runs }));
  }

  const heading = (text) => new Paragraph({
    spacing: { before: t.tight ? 120 : 200, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 2 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: half + 1, color: accent })],
  });
  const bullet = (text) => new Paragraph({
    bullet: { level: 0 },
    spacing: { after: t.tight ? 10 : 30 },
    children: [new TextRun({ text, size: half })],
  });
  const tab = { type: TabStopType.RIGHT, position: 9600 };

  for (const s of sections(r)) {
    children.push(heading(s.title));
    if (s.kind === 'text') {
      children.push(new Paragraph({ spacing: { after: gap }, children: [new TextRun({ text: s.text, size: half })] }));
    } else if (s.kind === 'experience') {
      for (const e of s.items) {
        children.push(new Paragraph({
          tabStops: [tab],
          spacing: { before: gap, after: 0 },
          children: [
            new TextRun({ text: e.title || '', bold: true, size: half }),
            new TextRun({ text: `\t${dates(e)}`, size: half }),
          ],
        }));
        children.push(new Paragraph({
          tabStops: [tab],
          spacing: { after: 40 },
          children: [
            new TextRun({ text: e.company || '', italics: true, size: half }),
            new TextRun({ text: e.location ? `\t${e.location}` : '', size: half }),
          ],
        }));
        for (const b of e.bullets || []) children.push(bullet(b));
      }
    } else if (s.kind === 'education') {
      for (const e of s.items) {
        children.push(new Paragraph({
          tabStops: [tab],
          spacing: { after: 20 },
          children: [
            new TextRun({ text: [e.degree, e.school].filter(Boolean).join(', '), bold: true, size: half }),
            new TextRun({ text: `\t${dates(e)}`, size: half }),
          ],
        }));
        if (e.details) children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: e.details, size: half })] }));
      }
    } else {
      for (const b of s.items) children.push(bullet(b));
    }
  }

  const doc = new Document({
    creator: r.name || 'HunterOps',
    title: `${r.name || 'Resume'} - Resume`,
    styles: { default: { document: { run: { font: t.docxFont, size: half } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
      children,
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

// ---- PDF ---------------------------------------------------------------------

const PDF_FONTS = {
  times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic],
  helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique],
};

// Standard PDF fonts only cover WinAnsi; swap common characters and drop the rest.
const SWAPS = { '₹': 'Rs.', '→': '->', '←': '<-', '✓': '-', '≥': '>=', '≤': '<=', ' ': ' ', '\t': ' ' };
function safeText(font, text) {
  let out = '';
  for (const ch of String(text || '').replace(/[\r\n]+/g, ' ')) {
    const c = SWAPS[ch] ?? ch;
    try {
      font.encodeText(c);
      out += c;
    } catch {
      out += '';
    }
  }
  return out;
}

export async function renderPdf(r, templateKey = 'classic') {
  const t = TEMPLATES[templateKey] || TEMPLATES.classic;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${r.name || 'Resume'} - Resume`);
  pdf.setAuthor(r.name || '');
  pdf.setCreator('HunterOps');
  const [regular, bold, italic] = await Promise.all(PDF_FONTS[t.pdf].map((f) => pdf.embedFont(f)));
  const accent = rgb(...t.accent);
  const black = rgb(0.1, 0.1, 0.1);
  const W = 595.28;
  const H = 841.89;
  const M = 46;
  const width = W - 2 * M;
  const size = t.size;
  const lead = size * (t.tight ? 1.25 : 1.35);
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const ensure = (h) => {
    if (y - h < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const wrap = (text, font, sz, maxW) => {
    const words = safeText(font, text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, sz) <= maxW || !line) line = next;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const draw = (text, { font = regular, sz = size, color = black, x = M, maxW = width, align = 'left', lh = lead } = {}) => {
    for (const ln of wrap(text, font, sz, maxW)) {
      ensure(lh);
      const w = font.widthOfTextAtSize(ln, sz);
      const dx = align === 'center' ? x + (maxW - w) / 2 : align === 'right' ? x + maxW - w : x;
      page.drawText(ln, { x: dx, y: y - sz, size: sz, font, color });
      y -= lh;
    }
  };
  const leftRight = (left, right, lf, rf) => {
    ensure(lead);
    const rt = safeText(rf, right);
    const rw = rf.widthOfTextAtSize(rt, size);
    const lt = wrap(left, lf, size, width - rw - 12)[0] || '';
    page.drawText(lt, { x: M, y: y - size, size, font: lf, color: black });
    if (rt) page.drawText(rt, { x: M + width - rw, y: y - size, size, font: rf, color: black });
    y -= lead;
  };

  const align = t.centered ? 'center' : 'left';
  draw(r.name || 'Your Name', { font: bold, sz: size + 9, color: accent, align, lh: (size + 9) * 1.25 });
  if (r.headline) draw(r.headline, { sz: size + 1, align });
  const contacts = contactLine(r);
  if (contacts.length) draw(contacts.join('  |  '), { sz: size - 0.5, align });
  y -= t.tight ? 2 : 4;

  for (const s of sections(r)) {
    y -= t.tight ? 6 : 9;
    ensure(lead * 3);
    draw(s.title.toUpperCase(), { font: bold, sz: size + 0.5, color: accent });
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: M + width, y: y + 2 }, thickness: 0.7, color: accent });
    y -= 3;
    if (s.kind === 'text') draw(s.text);
    else if (s.kind === 'experience') {
      for (const e of s.items) {
        y -= t.tight ? 2 : 4;
        ensure(lead * 3);
        leftRight(e.title || '', dates(e), bold, regular);
        leftRight(e.company || '', e.location || '', italic, regular);
        for (const b of e.bullets || []) bulletLine(b);
      }
    } else if (s.kind === 'education') {
      for (const e of s.items) {
        leftRight([e.degree, e.school].filter(Boolean).join(', '), dates(e), bold, regular);
        if (e.details) draw(e.details);
      }
    } else {
      for (const b of s.items) bulletLine(b);
    }
  }

  function bulletLine(text) {
    const indent = 12;
    const lines = wrap(text, regular, size, width - indent);
    lines.forEach((ln, i) => {
      ensure(lead);
      if (i === 0) page.drawText('•', { x: M + 2, y: y - size, size, font: regular, color: black });
      page.drawText(ln, { x: M + indent, y: y - size, size, font: regular, color: black });
      y -= lead;
    });
  }

  return Buffer.from(await pdf.save());
}
