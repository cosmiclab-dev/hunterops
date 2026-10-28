// Notifications: a row for the bell, and a Web Push to every phone or browser
// that turned them on. The push keys are made on first use and kept in the
// database, so there is nothing to set up.
import webpush from 'web-push';
import { prisma } from './db';
import { loadSettings, saveInternal } from './settings';
import { clip } from './utils';

export async function vapidKeys() {
  const s = await loadSettings();
  let pub = s.get('vapid_public');
  let priv = s.get('vapid_private');
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey;
    priv = k.privateKey;
    await saveInternal('vapid_private', priv);
    await saveInternal('vapid_public', pub);
  }
  return { publicKey: pub, privateKey: priv };
}

export async function notify(n: { kind: string; title: string; body?: string; href?: string | null; taskId?: string | null }) {
  const row = await prisma.notification.create({
    data: { kind: n.kind, title: clip(n.title, 200) || 'HunterOps', body: clip(n.body || '', 600) || '', href: n.href || null, taskId: n.taskId || null },
  }).catch((e) => { console.error('[notify]', (e as Error).message); return null; });
  await push({ title: n.title, body: n.body || '', href: n.href || '/notifications' }).catch((e) => console.error('[push]', (e as Error).message));
  return row;
}

async function push(p: { title: string; body: string; href: string }) {
  const subs = await prisma.pushSubscription.findMany();
  if (!subs.length) return;
  const { publicKey, privateKey } = await vapidKeys();
  webpush.setVapidDetails('mailto:hunterops@example.com', publicKey, privateKey);
  const payload = JSON.stringify({ title: clip(p.title, 120), body: clip(p.body, 240) || '', href: p.href });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // The phone turned them off or the subscription expired.
      if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      else console.error('[push]', code, (e as Error).message);
    }
  }));
}
