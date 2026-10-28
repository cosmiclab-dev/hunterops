import { ok, route } from '@/lib/http';
import { activity } from '@/lib/tasks';

export const dynamic = 'force-dynamic';

// What the progress bar and the bell read, every few seconds while work runs.
export const GET = route(async () => ok(await activity()));
