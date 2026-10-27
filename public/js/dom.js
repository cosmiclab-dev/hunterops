// Tiny DOM helpers. Everything user- or model-supplied goes in as text, never HTML.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'value') el.value = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, { error = false, ms = 3200 } = {}) {
  const box = $('#toasts');
  const el = h('div', { class: `toast${error ? ' error' : ''}`, role: error ? 'alert' : 'status' }, message);
  box.append(el);
  setTimeout(() => el.remove(), error ? ms + 2500 : ms);
}

export async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const ta = h('textarea', { class: 'sr-only' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  if (button) {
    const original = button.textContent;
    button.textContent = 'Copied';
    button.classList.add('copied');
    setTimeout(() => {
      button.textContent = original;
      button.classList.remove('copied');
    }, 1400);
  } else {
    toast('Copied to clipboard');
  }
}

export function copyButton(getText, label = 'Copy', cls = 'btn btn-ghost btn-sm') {
  const btn = h('button', { type: 'button', class: cls }, label);
  btn.addEventListener('click', () => copyText(typeof getText === 'function' ? getText() : getText, btn));
  return btn;
}

// Puts a button into a busy state; returns a function that restores it.
export function busy(button, label = 'Working…') {
  const original = [...button.childNodes];
  button.disabled = true;
  button.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), label);
  return () => {
    button.disabled = false;
    button.replaceChildren(...original);
  };
}

// Renders text with [bracketed slots] highlighted, so missing numbers stand out.
export function withSlots(text) {
  const frag = document.createDocumentFragment();
  const parts = String(text).split(/(\[[^\]\n]{1,60}\])/g);
  for (const part of parts) {
    if (/^\[[^\]]+\]$/.test(part)) frag.append(h('span', { class: 'slot' }, part));
    else if (part) frag.append(document.createTextNode(part));
  }
  return frag;
}

export function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const storage = {
  // Reads this tab's session value first, then the device-wide one.
  get(key, fallback = null) {
    try {
      const v = sessionStorage.getItem(`hunterops:${key}`) ?? localStorage.getItem(`hunterops:${key}`);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === null || value === undefined || value === '') localStorage.removeItem(`hunterops:${key}`);
      else localStorage.setItem(`hunterops:${key}`, value);
    } catch { /* storage blocked: settings just won't persist */ }
  },
  // remember=false keeps the value for this tab only (sessionStorage).
  setScoped(key, value, remember) {
    try {
      localStorage.removeItem(`hunterops:${key}`);
      sessionStorage.removeItem(`hunterops:${key}`);
      if (value) (remember ? localStorage : sessionStorage).setItem(`hunterops:${key}`, value);
    } catch { /* storage blocked */ }
  },
  isRemembered(key) {
    try {
      return localStorage.getItem(`hunterops:${key}`) !== null;
    } catch {
      return false;
    }
  },
};
