import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';
import { THEME_SCRIPT } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'HunterOps',
  description: 'Recruiter command center: fresh jobs, Grill Score, pipeline, tailored resumes and outreach.',
  appleWebApp: { capable: true, title: 'HunterOps', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F7F9' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0B10' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <Nav />
        <main className="mx-auto w-full max-w-5xl px-4 pb-32 pt-5 md:px-8 md:pb-16 md:pt-8">{children}</main>
      </body>
    </html>
  );
}
