import { ok, route } from '@/lib/http';
import { autoPrepare } from '@/lib/apply';
import { inBackground } from '@/lib/background';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// "Prepare my top matches": the best new jobs get an application ready for
// review. It answers once they have started; each one shows its progress.
export const POST = route(async () => ok(await autoPrepare(undefined, { background: inBackground })));
