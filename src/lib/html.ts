// HTML helpers for the in-app Browser: an allow-list sanitizer for the reader
// view, JSON-LD JobPosting extraction, and application-form field discovery.
// The reader HTML is also shown in a sandboxed iframe with scripts disabled.
import { parse, type HTMLElement, NodeType, type Node } from 'node-html-parser';
import { decodeEntities, htmlToText } from './text';

const KEEP = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'a',
  'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span', 'section', 'article', 'dl', 'dt', 'dd',
]);
const DROP = new Set(['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'svg', 'canvas', 'form', 'input', 'button', 'select', 'textarea', 'nav', 'footer', 'header', 'aside', 'template', 'link', 'meta', 'head', 'img', 'video', 'audio', 'picture', 'source']);
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function clean(node: Node, base: string | undefined, out: string[]) {
  if (node.nodeType === NodeType.TEXT_NODE) {
    out.push(escapeHtml(decodeEntities(node.rawText)));
    return;
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.rawTagName?.toLowerCase() || '';
  if (DROP.has(tag)) return;
  let close = '';
  if (KEEP.has(tag)) {
    if (tag === 'a') {
      let href = '';
      try {
        const u = new URL(el.getAttribute('href') || '', base);
        if (/^https?:$/.test(u.protocol)) href = u.toString();
      } catch { /* drop bad links */ }
      out.push(href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">` : '<span>');
      close = href ? '</a>' : '</span>';
    } else {
      out.push(`<${tag}>`);
      close = ['br', 'hr'].includes(tag) ? '' : `</${tag}>`;
    }
  }
  for (const child of el.childNodes) clean(child, base, out);
  out.push(close);
}

// Strips everything except basic text structure. No attributes survive except safe link hrefs.
export function sanitizeHtml(html: string, base?: string): string {
  const root = parse(html, { comment: false, blockTextElements: { script: false, style: false, noscript: false, pre: true } });
  const out: string[] = [];
  clean(root, base, out);
  return out.join('').replace(/(<(div|span|section)>\s*<\/\2>)+/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function textToHtml(text: string) {
  return text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
}

// The main readable block of a generic page: <main>, <article>, or the body.
export function mainContent(html: string): { title: string; html: string } {
  const root = parse(html, { comment: false });
  // "Role | Company careers" in <title>: the page's own h1 is the cleaner name.
  const docTitle = decodeEntities(root.querySelector('title')?.text || '').trim();
  const h1 = decodeEntities(root.querySelector('h1')?.text || '').trim();
  const title = h1 && h1.length < 140 && (!docTitle || docTitle.includes(h1)) ? h1 : docTitle || h1;
  const pick = root.querySelector('main') || root.querySelector('article') || root.querySelector('[role=main]') || root.querySelector('body') || root;
  return { title, html: pick.toString() };
}

export type JsonLdJob = {
  title: string; company: string | null; location: string | null; remote: boolean; description: string | null;
  postedAt: string | null; salary: string | null;
};

// schema.org JobPosting from <script type="application/ld+json">, which most job sites publish.
export function jobPostingFromHtml(html: string): JsonLdJob | null {
  const root = parse(html, { comment: false, blockTextElements: { script: true } });
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    let data: any;
    try {
      data = JSON.parse(s.text.trim());
    } catch {
      continue;
    }
    const items = (Array.isArray(data) ? data : data?.['@graph'] ? data['@graph'] : [data]) as any[];
    const job = items.find((d) => d && (d['@type'] === 'JobPosting' || (Array.isArray(d['@type']) && d['@type'].includes('JobPosting'))));
    if (!job) continue;
    const locs = (Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation]).filter(Boolean)
      .map((l: any) => [l?.address?.addressLocality, l?.address?.addressRegion, l?.address?.addressCountry?.name ?? l?.address?.addressCountry].filter(Boolean).join(', '))
      .filter(Boolean);
    const bs = job.baseSalary?.value;
    const salary = bs ? [job.baseSalary.currency, bs.minValue ?? bs.value, bs.maxValue ? `– ${bs.maxValue}` : '', bs.unitText ? `per ${String(bs.unitText).toLowerCase()}` : ''].filter(Boolean).join(' ') : null;
    return {
      title: decodeEntities(job.title || '').trim(),
      company: job.hiringOrganization?.name || null,
      location: locs.join(' / ') || null,
      remote: job.jobLocationType === 'TELECOMMUTE',
      description: htmlToText(job.description) || null,
      postedAt: job.datePosted || null,
      salary,
    };
  }
  return null;
}

export type FormField = {
  key: string;          // name attribute or a slug of the label
  label: string;
  type: 'text' | 'email' | 'tel' | 'url' | 'textarea' | 'select' | 'file' | 'checkbox' | 'number' | 'date';
  required: boolean;
  options?: string[];
};

const FIELD_TYPES = new Set(['text', 'email', 'tel', 'url', 'number', 'date', 'file', 'checkbox', 'radio']);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

// The fields of the application form on a page (first <form> with a file or
// several inputs). Hidden and submit inputs are skipped.
export function formFields(html: string): FormField[] {
  const doc = parse(html, { comment: false });
  // The application form: the <form> with a file input, else the one with the most fields.
  // Footer newsletter boxes and search bars stay out.
  const forms = doc.querySelectorAll('form');
  const count = (f: (typeof forms)[number]) => f.querySelectorAll('input, textarea, select').length;
  const root = forms.find((f) => f.querySelector('input[type=file]')) || [...forms].sort((a, b) => count(b) - count(a)).find((f) => count(f) >= 3) || doc;
  const labels = new Map<string, string>();
  const starred = new Set<string>();
  for (const l of doc.querySelectorAll('label')) {
    const f = l.getAttribute('for');
    if (!f) continue;
    const text = l.text.replace(/\s+/g, ' ').trim();
    if (/\*\s*$/.test(text)) starred.add(f);
    labels.set(f, text.replace(/\*\s*$/, '').trim());
  }
  const fields: FormField[] = [];
  const seen = new Set<string>();
  for (const el of root.querySelectorAll('input, textarea, select')) {
    const tag = el.rawTagName.toLowerCase();
    const rawType = (el.getAttribute('type') || 'text').toLowerCase();
    if (tag === 'input' && !FIELD_TYPES.has(rawType)) continue;
    const id = el.getAttribute('id') || '';
    const name = el.getAttribute('name') || id;
    const wrapLabel = el.closest('label')?.text;
    const label = (labels.get(id) || el.getAttribute('aria-label') || wrapLabel || el.getAttribute('placeholder') || name || '').replace(/\s+/g, ' ').replace(/\*\s*$/, '').trim();
    if (!label || /captcha|csrf|token|honeypot/i.test(`${name} ${label}`)) continue;
    const key = name || slug(label);
    // Radio buttons are one question: group them by name, each button an option.
    if (rawType === 'radio') {
      const group = fields.find((x) => x.key === key);
      const option = (labels.get(id) || wrapLabel || el.getAttribute('value') || '').replace(/\s+/g, ' ').trim();
      if (group) {
        if (option) group.options = [...(group.options || []), option].slice(0, 40);
        continue;
      }
      const legend = el.closest('fieldset')?.querySelector('legend')?.text.replace(/\s+/g, ' ').replace(/\*\s*$/, '').trim();
      seen.add(key);
      fields.push({ key, label: (legend || name || option).slice(0, 300), type: 'select', required: el.hasAttribute('required'), options: option ? [option] : [] });
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    const type = (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : rawType) as FormField['type'];
    const options = tag === 'select' ? el.querySelectorAll('option').map((o) => o.text.trim()).filter((o) => o && !/^select|^--/i.test(o)).slice(0, 40) : undefined;
    fields.push({ key, label: label.slice(0, 300), type, required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true' || starred.has(id), options });
    if (fields.length >= 60) break;
  }
  return fields;
}
