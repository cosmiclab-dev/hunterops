// HunterOps bootstrap: tabs, health, and wiring between tabs.
import { h, $, $$ } from './dom.js';
import { api } from './api.js';
import { loadJobs } from './store.js';
import { initDiscovery } from './xray.js';
import { initPipeline } from './pipeline.js';
import { initRoaster } from './roaster.js';
import { initOutreach, draftFor } from './outreach.js';
import { initSettings, setServerInfo, hasOwnKey, currentModel } from './settings.js';

const TABS = ['discover', 'pipeline', 'roaster', 'outreach'];

function selectTab(name, { focus = false, push = true } = {}) {
  if (!TABS.includes(name)) name = 'discover';
  for (const tab of $$('.tab')) {
    const active = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  }
  const changed = $(`#panel-${name}`).hidden;
  for (const panel of $$('.panel')) panel.hidden = panel.id !== `panel-${name}`;
  if (changed) window.scrollTo({ top: 0 });
  $(`.tab[data-tab="${name}"]`).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (push && location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}

function initTabs() {
  const tabs = $$('.tab');
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
    tab.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      selectTab(tabs[(i + dir + tabs.length) % tabs.length].dataset.tab, { focus: true });
    });
  });
  for (const btn of $$('[data-goto]')) btn.addEventListener('click', () => selectTab(btn.dataset.goto));
  window.addEventListener('hashchange', () => selectTab(location.hash.slice(1), { push: false }));
  selectTab(location.hash.slice(1) || 'discover', { push: false });
}

function setPill(name, state, title) {
  const pill = $(`.pill[data-health="${name}"]`);
  pill.classList.remove('ok', 'warn', 'bad');
  if (state) pill.classList.add(state);
  pill.title = title;
}

let lastHealth = null;

function renderAiPill() {
  if (hasOwnKey()) setPill('ai', 'ok', `Your OpenCode Go key · ${currentModel()}`);
  else if (lastHealth?.ai.configured) setPill('ai', 'ok', `Site OpenCode Go key · ${currentModel()}`);
  else setPill('ai', 'bad', 'No OpenCode Go key. Add one in Settings.');
}

function renderHealthDetail() {
  const detail = $('#health-detail');
  if (!lastHealth) return;
  const db = lastHealth.database;
  const dbText = !db.configured ? 'DATABASE_URL not set'
    : !db.reachable ? 'Neon unreachable'
      : db.schema_ready ? 'Neon connected' : 'Connected, but schema.sql has not been run';
  detail.replaceChildren(
    h('div', {}, 'Database: ', h('code', {}, dbText)),
    h('div', {}, 'AI key: ', h('code', {}, hasOwnKey() ? 'yours (this browser)'
      : lastHealth.ai.configured ? "site's OPENCODE_API_KEY" : 'none yet')),
    h('div', {}, 'Access gate: ', h('code', {}, lastHealth.access_gate ? 'on' : 'off (set APP_ACCESS_TOKEN once deployed)')),
  );
}

async function checkHealth() {
  try {
    lastHealth = await api.health();
    const db = lastHealth.database;
    const dbState = !db.configured || !db.reachable ? 'bad' : db.schema_ready ? 'ok' : 'warn';
    setPill('db', dbState, !db.configured ? 'DATABASE_URL not set'
      : !db.reachable ? 'Neon unreachable' : db.schema_ready ? 'Neon connected' : 'Run db/schema.sql on Neon');
    setServerInfo(lastHealth.ai);
    renderAiPill();
    renderHealthDetail();
  } catch (err) {
    setPill('db', 'bad', err.message);
    renderAiPill();
    $('#health-detail').replaceChildren(h('div', { class: 'form-msg error' }, err.message));
  }
}

function boot() {
  initTabs();
  const settings = initSettings({
    onSaved: () => {
      checkHealth();
      loadJobs();
    },
  });
  window.addEventListener('hunterops:settings', () => {
    renderAiPill();
    renderHealthDetail();
  });
  window.addEventListener('hunterops:need-ai-key', () => settings.open());
  initDiscovery();
  initPipeline({
    draftOutreach: (job) => {
      selectTab('outreach');
      draftFor(job);
    },
  });
  initRoaster();
  initOutreach();
  checkHealth();
  loadJobs();
}

boot();
