// Tab 4: sub-60-word cold outreach (generate_outreach) + outreach log.
import { h, $, $$, toast, busy, withSlots, copyText, timeAgo, storage } from './dom.js';
import { api } from './api.js';
import { currentModel, aiReady } from './settings.js';
import { store, subscribe, upsertJob, bumpOutreach } from './store.js';

const CHANNELS = [
  { key: 'linkedin_dm', label: 'LinkedIn DM' },
  { key: 'email', label: 'Email' },
  { key: 'referral', label: 'Referral' },
];
const DEFAULT_CHANNEL = { head_of_ta: 'linkedin_dm', peer_referral: 'referral', practice_head: 'email' };
const LIMIT = 60;

let lastRequest = null;

const countWords = (t) => t.trim().split(/\s+/).filter(Boolean).length;

function syncJobOptions() {
  const select = $('#outreach-job');
  const current = select.value;
  select.replaceChildren(
    h('option', { value: '' }, 'None (fill in by hand)'),
    ...store.jobs.map((j) => h('option', { value: j.id }, `${j.company} · ${j.title}`)),
  );
  if (store.jobs.some((j) => j.id === current)) select.value = current;
}

function fillFromJob(job) {
  const form = $('#outreach-form');
  form.elements.job_id.value = job ? job.id : '';
  if (!job) return;
  form.elements.company.value = job.company;
  form.elements.role_url.value = job.url;
  const posted = timeAgo(job.discovered_at);
  form.elements.req_details.value = [
    `${job.title}${job.location ? `, ${job.location}` : ''}`,
    posted ? `found ${posted}` : null,
    job.notes || null,
  ].filter(Boolean).join('; ');
}

function messageCard(m) {
  const textarea = h('textarea', { rows: 6, 'aria-label': `${m.label} message` });
  textarea.value = m.message;
  const counter = h('span', { class: 'wordcount' });
  const updateCount = () => {
    const n = countWords(textarea.value);
    counter.textContent = `${n} words`;
    counter.classList.toggle('over', n >= LIMIT);
  };
  textarea.addEventListener('input', updateCount);
  updateCount();

  const preview = h('p', { class: 'small muted' });
  const slotCount = (textarea.value.match(/\[[^\]]+\]/g) || []).length;
  if (slotCount) preview.append(withSlots(`Fill ${slotCount} slot${slotCount > 1 ? 's' : ''} before sending, e.g. [Name].`));

  const copy = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Copy');
  copy.addEventListener('click', () => copyText(textarea.value.trim(), copy));

  const channel = h('select', { 'aria-label': 'Channel' },
    CHANNELS.map((c) => h('option', { value: c.key, selected: c.key === DEFAULT_CHANNEL[m.audience] }, c.label)));
  const advance = h('input', { type: 'checkbox', checked: true });
  const save = h('button', { type: 'button', class: 'btn btn-sm' }, 'Save to log');
  save.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) return;
    if (/\[Name\]/.test(text) && !window.confirm('The message still has [Name] in it. Log it anyway?')) return;
    const restore = busy(save, 'Saving…');
    try {
      const jobId = lastRequest?.job_id || null;
      const res = await api.logOutreach({
        job_id: jobId,
        recipient_role: `${m.label}: ${lastRequest?.recipient_title || ''}`.replace(/:\s*$/, ''),
        channel: channel.value,
        message_sent: text,
        mark_contacted: Boolean(jobId) && advance.checked,
      });
      if (res.job) upsertJob(res.job);
      if (jobId) bumpOutreach(jobId);
      restore();
      save.textContent = 'Saved ✓';
      save.disabled = true;
      toast(res.job ? 'Logged, and the lead moved to Contacted' : 'Logged to outreach history');
      loadLog();
    } catch (err) {
      restore();
      toast(`Couldn't save: ${err.message}`, { error: true });
    }
  });

  return h('article', { class: 'card message-card' },
    h('div', { class: 'card-head' }, h('h3', {}, m.label), counter),
    textarea,
    preview,
    h('div', { class: 'save-row' },
      copy, channel, save,
      lastRequest?.job_id ? h('label', { class: 'field-inline' }, advance, h('span', {}, 'Mark lead contacted')) : null),
  );
}

async function loadLog() {
  const root = $('#outreach-log');
  try {
    const { outreach } = await api.listOutreach();
    if (!outreach.length) {
      root.replaceChildren(h('p', { class: 'muted' }, 'Nothing logged yet. Save a message above once you send it.'));
      return;
    }
    root.replaceChildren(...outreach.map((o) => h('div', { class: 'log-item' },
      h('div', { class: 'log-head' },
        h('strong', {}, o.job_company ? `${o.job_company} · ${o.job_title}` : 'No linked lead'),
        h('span', {}, o.recipient_role),
        h('span', { class: 'badge' }, (CHANNELS.find((c) => c.key === o.channel) || {}).label || o.channel),
        h('span', { class: 'age', title: new Date(o.sent_at).toLocaleString() }, timeAgo(o.sent_at)),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: (e) => copyText(o.message_sent, e.currentTarget) }, 'Copy')),
      h('p', { class: 'log-body' }, o.message_sent),
    )));
  } catch (err) {
    root.replaceChildren(h('p', { class: 'form-msg error' }, `Couldn't load the log: ${err.message}`));
  }
}

export function draftFor(job) {
  fillFromJob(job);
  $('#outreach-form').elements.recipient_title.focus();
}

export function initOutreach() {
  const form = $('#outreach-form');
  const msg = $('#outreach-msg');

  form.elements.proof_points.value = storage.get('proof_points', '');
  form.elements.proof_points.addEventListener('change', () => storage.set('proof_points', form.elements.proof_points.value.trim()));

  $('#outreach-job').addEventListener('change', (e) => {
    fillFromJob(store.jobs.find((j) => j.id === e.target.value) || null);
  });
  subscribe(syncJobOptions);
  syncJobOptions();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const audiences = $$('input[name="audiences"]:checked', form).map((i) => i.value);
    const missing = ['company', 'recipient_title'].filter((k) => !String(data[k] || '').trim());
    for (const name of ['company', 'recipient_title']) {
      form.elements[name].setAttribute('aria-invalid', String(missing.includes(name)));
    }
    if (missing.length || !audiences.length) {
      msg.className = 'form-msg error';
      msg.textContent = missing.length ? 'Company and recipient title are required.' : 'Pick at least one audience.';
      return;
    }
    if (!aiReady()) {
      msg.className = 'form-msg error';
      msg.textContent = 'Add your OpenCode Go API key in Settings first.';
      window.dispatchEvent(new CustomEvent('hunterops:need-ai-key'));
      return;
    }
    storage.set('proof_points', data.proof_points.trim());
    msg.className = 'form-msg';
    msg.textContent = 'Writing…';
    const restore = busy(form.querySelector('button[type="submit"]'), 'Generating…');
    const payload = {
      action: 'generate_outreach',
      company: data.company,
      recipient_title: data.recipient_title,
      role_url: data.role_url,
      req_details: data.req_details,
      proof_points: data.proof_points,
      audiences,
      model: currentModel(),
    };
    try {
      const res = await api.ai(payload);
      lastRequest = { ...payload, job_id: data.job_id || null };
      $('#message-results').replaceChildren(...res.result.messages.map(messageCard));
      const over = res.result.messages.filter((m) => m.over_limit).length;
      msg.className = over ? 'form-msg error' : 'form-msg ok';
      msg.textContent = over
        ? `${over} message${over > 1 ? 's are' : ' is'} 60+ words. Trim before sending, or generate again.`
        : `Done with ${res.model}. Every message is under 60 words.`;
    } catch (err) {
      msg.className = 'form-msg error';
      msg.textContent = err.message;
    } finally {
      restore();
    }
  });

  $('#refresh-log').addEventListener('click', loadLog);
  loadLog();
}
