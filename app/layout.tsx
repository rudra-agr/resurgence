import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, IBM_Plex_Mono, Public_Sans } from 'next/font/google';
import { LedgerProvider } from './Providers';
import { SiteFooter, SiteNav } from './SiteChrome';

// Self-hosted by next/font at build time, so the strict CSP (font-src 'self') still holds.
const display = Fraunces({ subsets: ['latin'], variable: '--f-display', display: 'swap' });
const body = Public_Sans({ subsets: ['latin'], variable: '--f-body', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--f-mono', display: 'swap' });

const description =
  'A public ledger for disaster relief. Follow every need from request to doorstep, and see exactly what a donation buys.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: { default: 'Resurgence: see exactly what your donation buys', template: '%s · Resurgence' },
  description,
  alternates: { canonical: '/' },
  openGraph: { title: 'Resurgence', description, type: 'website', siteName: 'Resurgence' },
  twitter: { card: 'summary', title: 'Resurgence', description },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <LedgerProvider>
          <a className="skip" href="#main">Skip to content</a>
          <SiteNav />
          <main id="main">{children}</main>
          <SiteFooter />
        </LedgerProvider>
      </body>
    </html>
  );
}
