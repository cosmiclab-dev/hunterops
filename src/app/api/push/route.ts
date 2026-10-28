import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http';
import { notify, vapidKeys } from '@/lib/notify';

export const dynamic = 'force-dynamic';

// The public key a phone needs to subscribe, and how many are subscribed.
export const GET = route(async () => {
  const [{ publicKey }, devices] = await Promise.all([vapidKeys(), prisma.pushSubscription.count()]);
  return ok({ publicKey, devices });
});

const Sub = z.object({ endpoint: z.string().url().max(2000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }), test: z.boolean().optional() });

// Saves this phone's subscription and sends a first notification to prove it works.
export const POST = route(async (req: Request) => {
  const { endpoint, keys, test } = Sub.parse(await readJson(req));
  await prisma.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, p256dh: keys.p256dh, auth: keys.auth }, update: { p256dh: keys.p256dh, auth: keys.auth } });
  if (test !== false) await notify({ kind: 'info', title: 'Notifications are on', body: 'HunterOps will tell you when an application is ready, when something fails and when a scan finds new matches.', href: '/notifications' });
  return ok({ ok: true }, 201);
});

export const DELETE = route(async (req: Request) => {
  const { endpoint } = z.object({ endpoint: z.string().url() }).parse(await readJson(req));
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return ok({ ok: true });
});
