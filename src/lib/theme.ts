// Theme preference: "system" follows the iPhone/OS setting, or force light/dark.
export type ThemePref = 'system' | 'light' | 'dark';
export const THEME_KEY = 'hunterops-theme';

// Runs in <head> before paint so the page never flashes the wrong theme.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.dataset.theme=t;}catch(e){}})();`;

export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.dataset.theme = pref;
  const meta = document.querySelector('meta[name="theme-color"]:not([media])') as HTMLMetaElement | null;
  if (meta) meta.content = dark ? '#0A0B10' : '#F7F7F9';
}

export function readTheme(): ThemePref {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function saveTheme(pref: ThemePref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* private mode */ }
  applyTheme(pref);
}
