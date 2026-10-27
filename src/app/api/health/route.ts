import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/http';
import { hasAppSecret } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  let db = false;
  let schema = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
    await prisma.setting.count();
    schema = true;
  } catch { /* reported below */ }
  return ok({
    ok: db && schema,
    db,
    schema,
    app_secret: hasAppSecret(),
    password: Boolean(process.env.APP_PASSWORD),
    cron_secret: Boolean(process.env.CRON_SECRET),
  });
});
