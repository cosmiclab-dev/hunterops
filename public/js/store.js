// Shared pipeline state. Tabs subscribe to job changes instead of refetching.
import { api } from './api.js';

export const STATUSES = [
  { key: 'discovered', label: 'Discovered' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'screening', label: 'Screening' },
  { key: 'offer', label: 'Offer' },
  { key: 'rejected', label: 'Rejected' },
];

const listeners = new Set();
export const store = {
  jobs: [],
  loaded: false,
  loading: false,
  error: null,
};

function emit() {
  for (const fn of listeners) fn(store);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function loadJobs() {
  store.loading = true;
  emit();
  try {
    const { jobs } = await api.listJobs();
    store.jobs = jobs;
    store.loaded = true;
    store.error = null;
  } catch (err) {
    store.error = err.message;
  } finally {
    store.loading = false;
    emit();
  }
}

export function upsertJob(job) {
  const i = store.jobs.findIndex((j) => j.id === job.id);
  if (i === -1) store.jobs.unshift(job);
  else store.jobs[i] = { ...store.jobs[i], ...job };
  emit();
}

export function removeJob(id) {
  store.jobs = store.jobs.filter((j) => j.id !== id);
  emit();
}

// Optimistic update: apply locally, persist, roll back on failure.
export async function patchJob(id, patch) {
  const before = store.jobs.find((j) => j.id === id);
  if (!before) return null;
  const snapshot = { ...before };
  upsertJob({ ...before, ...patch });
  try {
    const { job } = await api.updateJob(id, patch);
    upsertJob(job);
    return job;
  } catch (err) {
    upsertJob(snapshot);
    throw err;
  }
}

export function bumpOutreach(jobId) {
  const job = store.jobs.find((j) => j.id === jobId);
  if (!job) return;
  upsertJob({ ...job, outreach_count: (job.outreach_count || 0) + 1, last_outreach_at: new Date().toISOString() });
}
