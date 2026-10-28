import { ok, route } from '@/lib/http';
import { autoPrepare } from '@/lib/apply';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// "Prepare top matches" on the Pipeline: the best new jobs get an application ready for review.
export const POST = route(async () => ok(await autoPrepare()));
