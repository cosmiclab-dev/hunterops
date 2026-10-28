// Work that carries on after the request has answered: the phone gets its
// reply at once, and the function stays up until the work is done (Vercel
// waitUntil, within the route's maxDuration). Locally it just runs.
import { waitUntil } from '@vercel/functions';

export function inBackground(label: string, work: Promise<unknown>) {
  waitUntil(work.catch((err) => console.error(`[background] ${label}`, (err as Error).message)));
}
