// Tab 1 "Add to pipeline" form and Tab 2 board/table views.
import { h, $, $$, toast, timeAgo, storage } from './dom.js';
import { api } from './api.js';
import { ATS, detectAts, guessCompany } from './ats.js';
import { STATUSES, store, subscribe, loadJobs, upsertJob, removeJob, patchJob } from './store.js';

const ui = {
  filter: storage.get('pipeline_filter', 'all'),
  view: storage.get('pipeline_view', 'board'),
  search: '',
};

let onDraftOutreach = () => {};

// ---------- add form ----------

function initAddForm() {
  const form = $('#add-job-form');
  const atsSelect = $('#ats-select');
  atsSelect.append(h('option', { value: '' }, 'Auto-detect from URL'));
  for (const [key, label] of Object.entries(ATS)) atsSelect.append(h('option', { value: key }, label));

  const urlInput = form.elements.url;
  const msg = $('#add-job-msg');
  urlInput.addEventListener('input', () => {
    const type = detectAts(urlInput.value.trim());
    atsSelect.options[0].textContent = type ? `Auto: ${ATS[type]}` : 'Auto-detect from URL';
    if (!form.elements.company.value.trim()) {
      const guess = guessCompany(urlInput.value.trim());
      if (guess) form.elements.company.placeholder = guess;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'form-msg';
    msg.textContent = '';
    const data = Object.fromEntries(new FormData(form));
    if (!data.company.trim() && form.elements.company.placeholder !== 'Acme GCC') {
      data.company = form.elements.company.placeholder;
    }
    const missing = ['url', 'title', 'company'].filter((k) => !String(data[k] || '').trim());
    for (const name of ['url', 'title', 'company']) {
      form.elements[name].setAttribute('aria-invalid', String(missing.includes(name)));
    }
    if (missing.length) {
      msg.className = 'form-msg error';
      msg.textContent = `Fill in: ${missing.join(', ')}.`;
      return;
    }
    if (!detectAts(data.url.trim())) {
      form.elements.url.setAttribute('aria-invalid', 'true');
      msg.className = 'form-msg error';
      msg.textContent = 'URL must be a full link starting with https://';
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const payload = {
        title: data.title, company: data.company, url: data.url, location: data.location, notes: data.notes,
      };
      if (data.ats_type) payload.ats_type = data.ats_type;
      const { job } = await api.createJob(payload);
      upsertJob(job);
      form.reset();
      form.elements.company.placeholder = 'Acme GCC';
      atsSelect.options[0].textContent = 'Auto-detect from URL';
      msg.className = 'form-msg ok';
      msg.textContent = `Added: ${job.title} at ${job.company}.`;
      form.elements.url.focus();
    } catch (err) {
      msg.className = 'form-msg error';
      msg.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
}

// ---------- shared bits ----------

function statusSelect(job) {
  const select = h('select', { class: 'status-select', 'aria-label': `Status for ${job.title}`, dataset: { status: job.status } },
    STATUSES.map((s) => h('option', { value: s.key, selected: s.key === job.status }, s.label)));
  select.addEventListener('change', () => changeStatus(job, select.value));
  return select;
}

async function changeStatus(job, status) {
  if (status === job.status) return;
  try {
    await patchJob(job.id, { status });
    toast(`${job.company}: moved to ${STATUSES.find((s) => s.key === status).label}`);
  } catch (err) {
    toast(`Couldn't update: ${err.message}`, { error: true });
  }
}

async function editNotes(job) {
  const next = window.prompt(`Notes for ${job.title} at ${job.company}`, job.notes || '');
  if (next === null) return;
  try {
    await patchJob(job.id, { notes: next });
  } catch (err) {
    toast(`Couldn't save notes: ${err.message}`, { error: true });
  }
}

async function deleteJob(job) {
  if (!window.confirm(`Delete "${job.title}" at ${job.company}? Its outreach log entries go too.`)) return;
  try {
    await api.deleteJob(job.id);
    removeJob(job.id);
    toast('Lead deleted');
  } catch (err) {
    toast(`Couldn't delete: ${err.message}`, { error: true });
  }
}

function ageEl(job) {
  const fresh = Date.now() - new Date(job.discovered_at).getTime() < 24 * 3600 * 1000;
  return h('span', { class: `age${fresh ? ' fresh' : ''}`, title: new Date(job.discovered_at).toLocaleString() }, timeAgo(job.discovered_at));
}

function atsBadge(job) {
  return h('span', { class: `badge ats-${job.ats_type}` }, ATS[job.ats_type] || job.ats_type);
}

function filteredJobs() {
  const q = ui.search.trim().toLowerCase();
  return store.jobs.filter((j) => {
    if (ui.filter !== 'all' && j.status !== ui.filter) return false;
    if (!q) return true;
    return [j.title, j.company, j.location, j.notes].some((v) => v && v.toLowerCase().includes(q));
  });
}

// ---------- board ----------

function jobCard(job) {
  const card = h('article', { class: 'job-card', draggable: 'true', dataset: { id: job.id } },
    h('div', { class: 'job-title' }, h('a', { href: job.url, target: '_blank', rel: 'noopener noreferrer' }, job.title)),
    h('div', { class: 'job-meta' },
      h('strong', {}, job.company),
      job.location ? h('span', {}, job.location) : null,
    ),
    h('div', { class: 'job-meta' }, atsBadge(job), ageEl(job),
      job.outreach_count ? h('span', { class: 'age', title: 'Messages logged' }, `${job.outreach_count} msg`) : null),
    job.notes ? h('p', { class: 'job-notes' }, job.notes) : null,
    h('div', { class: 'job-actions' },
      statusSelect(job),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => onDraftOutreach(job) }, 'Draft'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => editNotes(job), 'aria-label': 'Edit notes' }, 'Notes'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-danger', onclick: () => deleteJob(job), 'aria-label': `Delete ${job.title}` }, '✕'),
    ),
  );
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', job.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  return card;
}

function renderBoard(jobs) {
  const board = $('#pipeline-board');
  const statuses = ui.filter === 'all' ? STATUSES : STATUSES.filter((s) => s.key === ui.filter);
  board.replaceChildren(...statuses.map((s) => {
    const items = jobs.filter((j) => j.status === s.key);
    const col = h('section', { class: 'column', dataset: { status: s.key }, 'aria-label': s.label },
      h('header', { class: 'column-head' }, h('h3', {}, s.label), h('span', { class: 'count' }, items.length)),
      items.map(jobCard),
    );
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drop-target');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drop-target'));
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drop-target');
      const job = store.jobs.find((j) => j.id === e.dataTransfer.getData('text/plain'));
      if (job) changeStatus(job, s.key);
    });
    return col;
  }));
}

// ---------- table ----------

function renderTable(jobs) {
  const rows = jobs.map((job) => {
    const notes = h('input', { type: 'text', class: 'notes-input', value: job.notes || '', 'aria-label': `Notes for ${job.title}`, maxlength: 5000 });
    notes.addEventListener('change', async () => {
      try {
        await patchJob(job.id, { notes: notes.value });
        toast('Notes saved');
      } catch (err) {
        toast(`Couldn't save notes: ${err.message}`, { error: true });
      }
    });
    return h('tr', {},
      h('td', {}, h('a', { href: job.url, target: '_blank', rel: 'noopener noreferrer' }, job.title)),
      h('td', {}, job.company),
      h('td', {}, job.location || '—'),
      h('td', {}, atsBadge(job)),
      h('td', {}, statusSelect(job)),
      h('td', {}, ageEl(job)),
      h('td', {}, notes),
      h('td', {},
        h('div', { class: 'job-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => onDraftOutreach(job) }, 'Draft'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-danger', onclick: () => deleteJob(job), 'aria-label': `Delete ${job.title}` }, '✕'))),
    );
  });
  $('#pipeline-table').replaceChildren(h('table', {},
    h('thead', {}, h('tr', {}, ['Title', 'Company', 'Location', 'ATS', 'Status', 'Found', 'Notes', ''].map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', {}, rows),
  ));
}

// ---------- stats + filters ----------

function renderStats() {
  const counts = Object.fromEntries(STATUSES.map((s) => [s.key, 0]));
  for (const j of store.jobs) counts[j.status] = (counts[j.status] || 0) + 1;
  const fresh = store.jobs.filter((j) => Date.now() - new Date(j.discovered_at).getTime() < 24 * 3600 * 1000).length;
  const active = counts.contacted + counts.screening + counts.offer;
  $('#pipeline-stats').replaceChildren(
    h('div', { class: 'stat' }, h('div', { class: 'num' }, store.jobs.length), h('div', { class: 'label' }, 'Total leads')),
    h('div', { class: 'stat', dataset: { status: 'discovered' } }, h('div', { class: 'num' }, fresh), h('div', { class: 'label' }, 'Added last 24h')),
    h('div', { class: 'stat', dataset: { status: 'contacted' } }, h('div', { class: 'num' }, active), h('div', { class: 'label' }, 'In play')),
    h('div', { class: 'stat', dataset: { status: 'screening' } }, h('div', { class: 'num' }, counts.screening), h('div', { class: 'label' }, 'Screening')),
    h('div', { class: 'stat', dataset: { status: 'offer' } }, h('div', { class: 'num' }, counts.offer), h('div', { class: 'label' }, 'Offers')),
  );

  const chip = (key, label, count) => {
    const btn = h('button', { type: 'button', class: 'filter-chip', 'aria-pressed': String(ui.filter === key) },
      label, h('span', { class: 'count' }, count));
    btn.addEventListener('click', () => {
      ui.filter = key;
      storage.set('pipeline_filter', key);
      render();
    });
    return btn;
  };
  $('#status-filters').replaceChildren(
    chip('all', 'All', store.jobs.length),
    ...STATUSES.map((s) => chip(s.key, s.label, counts[s.key])),
  );
  $('#pipeline-count').textContent = store.jobs.length ? String(store.jobs.length) : '';
}

function render() {
  const board = $('#pipeline-board');
  const table = $('#pipeline-table');
  const empty = $('#pipeline-empty');

  if (!store.loaded) {
    if (store.error) {
      board.hidden = false;
      table.hidden = true;
      empty.hidden = true;
      board.replaceChildren(h('div', { class: 'empty' }, h('p', {}, `Couldn't load the pipeline: ${store.error}`),
        h('button', { type: 'button', class: 'btn', onclick: loadJobs }, 'Try again')));
    } else {
      board.replaceChildren(...Array.from({ length: 3 }, () => h('div', { class: 'skeleton' })));
    }
    return;
  }

  renderStats();
  const jobs = filteredJobs();
  empty.hidden = store.jobs.length > 0;
  board.hidden = ui.view !== 'board' || store.jobs.length === 0;
  table.hidden = ui.view !== 'table' || store.jobs.length === 0;
  if (!board.hidden) renderBoard(jobs);
  if (!table.hidden) renderTable(jobs);
}

export function initPipeline({ draftOutreach }) {
  onDraftOutreach = draftOutreach;
  initAddForm();

  for (const seg of $$('.seg[data-view]')) {
    const active = seg.dataset.view === ui.view;
    seg.classList.toggle('active', active);
    seg.setAttribute('aria-pressed', String(active));
    seg.addEventListener('click', () => {
      ui.view = seg.dataset.view;
      storage.set('pipeline_view', ui.view);
      for (const s of $$('.seg[data-view]')) {
        s.classList.toggle('active', s === seg);
        s.setAttribute('aria-pressed', String(s === seg));
      }
      render();
    });
  }
  $('#pipeline-search').addEventListener('input', (e) => {
    ui.search = e.target.value;
    render();
  });
  $('#refresh-jobs').addEventListener('click', loadJobs);
  subscribe(render);
  render();
}
