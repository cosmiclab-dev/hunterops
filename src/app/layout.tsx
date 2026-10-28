import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Frame, Nav } from '@/components/nav';
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
    { media: '(prefers-color-scheme: light)', color: '#F5F5F7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
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
        <Frame>{children}</Frame>
      </body>
    </html>
  );
}
