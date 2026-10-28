// One time budget per request, shared by every AI call inside it, so a run of
// retries and rewrites stops cleanly before Vercel cuts the function off.
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage<{ ends: number }>();

// Requests may run 300 s on Vercel; this leaves room to save and answer.
export const REQUEST_BUDGET_MS = 280_000;

export const withBudget = <T>(fn: () => Promise<T>, ms = REQUEST_BUDGET_MS) => store.run({ ends: Date.now() + ms }, fn);

export const timeLeft = () => {
  const s = store.getStore();
  return s ? s.ends - Date.now() : Infinity;
};
