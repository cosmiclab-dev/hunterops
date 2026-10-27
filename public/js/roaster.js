// Tab 3: Capgemini profile & metric roaster (audit_profile).
import { h, $, toast, busy, withSlots, copyButton, copyText, storage } from './dom.js';
import { api } from './api.js';
import { currentModel, aiReady } from './settings.js';

const CATEGORY_LABELS = {
  time_to_fill: 'Time to fill',
  direct_sourcing_ratio: 'Direct-sourcing ratio',
  offer_to_join: 'Offer-to-join',
  stakeholder_management: 'Stakeholder management',
  agency_cost_savings: 'Agency cost savings',
  other: 'Other',
};

let last = null;

function render(result) {
  last = result;
  $('#roaster-results').hidden = false;

  const compare = $('#compare-list');
  if (!result.weak_phrases.length) {
    compare.replaceChildren(h('p', { class: 'muted' }, 'No weak phrasing found. Your bullets already lead with outcomes.'));
  } else {
    compare.replaceChildren(...result.weak_phrases.map((w) => h('div', { class: 'compare-row' },
      h('div', { class: 'compare-cell before' },
        h('span', { class: 'kicker' }, 'Fluffy operational duty'),
        h('p', { class: 'text' }, w.original),
        w.problem ? h('p', { class: 'why' }, w.problem) : null),
      h('div', { class: 'compare-cell after' },
        h('span', { class: 'kicker' }, `Enterprise scaled metric · ${CATEGORY_LABELS[w.category] || w.category}`),
        h('p', { class: 'text' }, withSlots(w.rewrite)),
        h('div', { class: 'row-actions' }, h('span'), copyButton(w.rewrite))),
    )));
  }

  $('#metric-list').replaceChildren(...result.metrics.map((m) => h('li', {},
    h('div', {},
      h('div', { class: 'metric-cat' }, CATEGORY_LABELS[m.category] || m.category),
      h('div', {}, withSlots(m.bullet)),
      m.how_to_defend ? h('div', { class: 'metric-defend' }, `If asked: ${m.how_to_defend}`) : null),
    copyButton(m.bullet),
  )));

  $('#pitch-text').replaceChildren(withSlots(result.pitch || ''));
  $('#roaster-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function initRoaster() {
  const form = $('#roaster-form');
  const msg = $('#roaster-msg');

  // Keep the draft between visits.
  for (const name of ['bullets', 'years', 'domain']) {
    form.elements[name].value = storage.get(`roaster:${name}`, '');
    form.elements[name].addEventListener('change', () => storage.set(`roaster:${name}`, form.elements[name].value));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!data.bullets.trim()) {
      msg.className = 'form-msg error';
      msg.textContent = 'Paste at least one bullet.';
      form.elements.bullets.focus();
      return;
    }
    if (!aiReady()) {
      msg.className = 'form-msg error';
      msg.textContent = 'Add your OpenCode Go API key in Settings first.';
      window.dispatchEvent(new CustomEvent('hunterops:need-ai-key'));
      return;
    }
    msg.className = 'form-msg';
    msg.textContent = 'The model is reading your bullets. This usually takes 10 to 30 seconds.';
    const restore = busy(form.querySelector('button[type="submit"]'), 'Roasting…');
    try {
      const res = await api.ai({
        action: 'audit_profile',
        bullets: data.bullets,
        years: data.years,
        domain: data.domain,
        model: currentModel(),
      });
      render(res.result);
      msg.className = 'form-msg ok';
      msg.textContent = `Done with ${res.model}. Orange [slots] need your real numbers.`;
    } catch (err) {
      msg.className = 'form-msg error';
      msg.textContent = err.message;
    } finally {
      restore();
    }
  });

  $('#copy-all-rewrites').addEventListener('click', (e) => {
    if (!last) return;
    copyText(last.weak_phrases.map((w) => `• ${w.rewrite}`).join('\n'), e.currentTarget);
  });
  $('#copy-all-metrics').addEventListener('click', (e) => {
    if (!last) return;
    copyText(last.metrics.map((m) => `• ${m.bullet}`).join('\n'), e.currentTarget);
  });
  $('#copy-pitch').addEventListener('click', (e) => {
    if (!last?.pitch) return toast('Run the roaster first.');
    copyText(last.pitch, e.currentTarget);
  });
}
