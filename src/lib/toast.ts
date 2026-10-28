// A small message after a tap: "Saved", "Scan finished", or what went wrong.
// Any component calls toast(); the Toaster in the layout shows it.
export type ToastTone = 'success' | 'danger' | 'info';
export type ToastMsg = { id: number; text: string; tone: ToastTone; href?: string; action?: string };

let next = 1;

export function toast(text: string, o: { tone?: ToastTone; href?: string; action?: string } = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastMsg>('hunterops:toast', { detail: { id: next++, text, tone: o.tone || 'success', href: o.href, action: o.action } }));
}

// Asks the progress bar and the bell to look again now (after starting work).
export function refreshActivity() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('hunterops:activity'));
}
