// Settings dialog: OpenCode Go key + model, app access key, and health status.
import { h, $, $$, toast, busy, storage } from './dom.js';
import { api } from './api.js';

export const DEFAULT_MODEL = 'deepseek-v4.1-flash';
const CUSTOM = '__custom__';

// Fallback catalog until /api/health returns the server's copy.
let catalog = [
  'deepseek-v4.1-flash', 'deepseek-v4-pro', 'glm-5.3-flash', 'glm-5.3', 'glm-5.2',
  'kimi-k3.1-pro', 'kimi-k3', 'kimi-k2.7-code', 'mimo-v2.6-flash', 'mimo-v2.6-pro',
  'mimo-v2.5', 'mimo-v2.5-pro', 'minimax-m3.1-flash', 'longcat-2.0', 'hy4-preview', 'hy3', 'step-5-preview',
];
let liveModels = [];
let server = { configured: false, model: DEFAULT_MODEL, models: [DEFAULT_MODEL, 'deepseek-v4-pro'] };

const LABELS = {
  'deepseek-v4.1-flash': 'DeepSeek V4.1 Flash (fast, recommended)',
  'deepseek-v4-pro': 'DeepSeek V4 Pro (deeper, slower)',
};

export function currentModel() {
  return storage.get('model') || server.model || DEFAULT_MODEL;
}

export function hasOwnKey() {
  return Boolean(storage.get('opencode_key'));
}

export function aiReady() {
  return hasOwnKey() || server.configured;
}

function announce() {
  for (const el of $$('.model-name')) el.textContent = currentModel();
  window.dispatchEvent(new CustomEvent('hunterops:settings'));
}

export function setServerInfo(ai) {
  server = { configured: ai.configured, model: ai.model || DEFAULT_MODEL, models: ai.models || [] };
  if (Array.isArray(ai.catalog) && ai.catalog.length) catalog = ai.catalog;
  announce();
}

function fillModelSelect(selected) {
  const select = $('#settings-model');
  const deepseek = catalog.filter((m) => m.startsWith('deepseek'));
  const others = catalog.filter((m) => !m.startsWith('deepseek'));
  // Live ids not in the catalog may sit on Go's Anthropic or Responses endpoints,
  // which this app doesn't call, so they are listed separately with a warning.
  const extra = liveModels.filter((m) => !catalog.includes(m));
  const known = new Set([...catalog, ...extra]);
  select.replaceChildren(
    h('optgroup', { label: 'DeepSeek' }, deepseek.map((m) => h('option', { value: m }, LABELS[m] || m))),
    h('optgroup', { label: 'Other OpenCode Go chat models' }, others.map((m) => h('option', { value: m }, m))),
    extra.length
      ? h('optgroup', { label: 'More from OpenCode (may not work: different API format)' }, extra.map((m) => h('option', { value: m }, m)))
      : null,
    h('option', { value: CUSTOM }, 'Custom model id…'),
  );
  const custom = $('#settings-form').elements.custom_model;
  if (known.has(selected)) {
    select.value = selected;
    custom.value = '';
  } else {
    select.value = CUSTOM;
    custom.value = selected;
  }
  syncCustomField();
}

function syncCustomField() {
  const isCustom = $('#settings-model').value === CUSTOM;
  $('#custom-model-field').hidden = !isCustom;
}

function chosenModel(form) {
  const v = form.elements.model.value;
  return v === CUSTOM ? form.elements.custom_model.value.trim() : v;
}

function updateKeyNote(form) {
  const note = $('#key-source-note');
  const typed = form.elements.opencode_key.value.trim();
  if (typed) {
    note.textContent = 'Using your key, so any model in the list can be used on your OpenCode Go plan.';
  } else if (server.configured) {
    note.textContent = `No key here, so the site's own key is used. It only allows: ${server.models.join(', ')}.`;
  } else {
    note.textContent = 'Required: AI features stay off until you add a key here or set OPENCODE_API_KEY in Netlify.';
  }
}

async function testConnection(form) {
  const result = $('#test-result');
  const model = chosenModel(form);
  if (!model) {
    result.className = 'form-msg error';
    result.textContent = 'Enter a custom model id first.';
    return;
  }
  const key = form.elements.opencode_key.value.trim();
  const restore = busy($('#test-connection'), 'Testing…');
  result.className = 'form-msg';
  result.textContent = `Sending a one-word test to ${model}…`;
  try {
    const res = await api.ai({ action: 'test_connection', model }, { opencodeKey: key });
    result.className = 'form-msg ok';
    result.textContent = `Connected: ${res.model} answered in ${(res.latency_ms / 1000).toFixed(1)}s using ${res.key_source === 'settings' ? 'your key' : "the site's key"}.`;
    if (Array.isArray(res.models) && res.models.length) {
      liveModels = res.models;
      fillModelSelect(model);
      const extra = res.models.filter((m) => !catalog.includes(m)).length;
      if (extra) result.textContent += ` OpenCode lists ${extra} more model${extra > 1 ? 's' : ''}, added to the dropdown.`;
    }
  } catch (err) {
    result.className = 'form-msg error';
    result.textContent = err.message;
  } finally {
    restore();
  }
}

export function initSettings({ onSaved }) {
  const dialog = $('#settings-dialog');
  const form = $('#settings-form');
  const keyInput = form.elements.opencode_key;

  const open = () => {
    keyInput.value = storage.get('opencode_key', '');
    keyInput.type = 'password';
    $('#toggle-key').textContent = 'Show';
    form.elements.remember_key.checked = hasOwnKey() ? storage.isRemembered('opencode_key') : true;
    form.elements.access_key.value = storage.get('access_key', '');
    fillModelSelect(currentModel());
    updateKeyNote(form);
    $('#test-result').textContent = '';
    dialog.showModal();
  };

  $('#settings-btn').addEventListener('click', open);
  for (const btn of $$('[data-open-settings]')) btn.addEventListener('click', open);
  $('#settings-model').addEventListener('change', () => {
    syncCustomField();
    if ($('#settings-model').value === CUSTOM) form.elements.custom_model.focus();
  });
  keyInput.addEventListener('input', () => updateKeyNote(form));
  $('#toggle-key').addEventListener('click', (e) => {
    const show = keyInput.type === 'password';
    keyInput.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'Hide' : 'Show';
    e.currentTarget.setAttribute('aria-pressed', String(show));
  });
  $('#test-connection').addEventListener('click', () => testConnection(form));
  $('#forget-key').addEventListener('click', () => {
    keyInput.value = '';
    storage.setScoped('opencode_key', '', false);
    updateKeyNote(form);
    announce();
    toast('OpenCode key removed from this browser');
  });

  form.addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'save') return;
    const model = chosenModel(form);
    if (!model || !/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,79}$/.test(model)) {
      e.preventDefault();
      $('#test-result').className = 'form-msg error';
      $('#test-result').textContent = 'Model id can only use letters, numbers and . - _ /';
      return;
    }
    const key = keyInput.value.trim();
    if (/\s/.test(key)) {
      e.preventDefault();
      $('#test-result').className = 'form-msg error';
      $('#test-result').textContent = 'The API key has spaces in it. Paste it again.';
      return;
    }
    storage.setScoped('opencode_key', key, form.elements.remember_key.checked);
    storage.set('model', model);
    storage.set('access_key', form.elements.access_key.value.trim());
  });

  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'save') return;
    announce();
    toast(`Saved. Model: ${currentModel()}`);
    onSaved();
  });

  let prompted = false;
  window.addEventListener('hunterops:unauthorized', () => {
    if (prompted || dialog.open) return;
    prompted = true;
    toast('This deployment is locked. Enter your access key.', { error: true });
    open();
  });

  announce();
  return { open };
}
