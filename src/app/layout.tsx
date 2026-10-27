import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';

export const metadata: Metadata = {
  title: 'HunterOps',
  description: 'Job search cockpit: feed, Grill Score, tailored resumes and recruiter emails.',
  appleWebApp: { capable: true, title: 'HunterOps', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Nav />
        <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 md:px-8 md:pb-16">{children}</main>
      </body>
    </html>
  );
}
