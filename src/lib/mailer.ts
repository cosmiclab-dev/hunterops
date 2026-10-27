// Gmail sending over SMTP with an app password. Only called for a draft the
// person has approved in the app; there is no bulk or scheduled send.
import nodemailer from 'nodemailer';
import { prisma } from './db';
import { HttpError } from './http';
import type { Settings } from './settings';

export async function sendApproved(settings: Settings, email: { id: string; toEmail: string; subject: string; body: string }) {
  const user = settings.get('smtp_user');
  const pass = settings.get('smtp_app_password');
  if (!user || !pass) throw new HttpError(503, 'Add your Gmail address and app password in Settings to send email.');
  const cap = Number(settings.get('daily_email_cap') || 20);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sentToday = await prisma.email.count({ where: { status: 'SENT', sentAt: { gte: since } } });
  if (sentToday >= cap) throw new HttpError(429, `Daily cap reached (${cap} emails in 24 hours). Change it in Settings.`);

  // SMTP_HOST/SMTP_PORT exist for local testing against a mail sink; production uses Gmail.
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass: pass.replace(/\s+/g, '') },
    ...(process.env.SMTP_HOST ? { tls: { rejectUnauthorized: false } } : {}),
  });
  const name = settings.get('sender_name');
  const info = await transport.sendMail({
    from: name ? `"${name.replace(/"/g, '')}" <${user}>` : user,
    to: email.toEmail,
    subject: email.subject,
    text: email.body,
  });
  return info.messageId as string;
}

export const EMAIL_RE = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;
