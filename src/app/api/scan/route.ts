import { ok, readJson, route } from '@/lib/http';
import { loadSettings } from '@/lib/settings';
import { runScan } from '@/lib/scan/scanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = route(async (req: Request) => {
  const body = await readJson<{ force?: boolean; companyIds?: string[] }>(req);
  const settings = await loadSettings();
  const summary = await runScan(settings, {
    trigger: 'manual',
    budgetMs: 45_000,
    force: Boolean(body.force),
    companyIds: Array.isArray(body.companyIds) ? body.companyIds.slice(0, 50) : null,
  });
  return ok(summary);
});
