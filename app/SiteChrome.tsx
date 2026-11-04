'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { send } from '@/lib/client';
import { useLedger } from './Providers';

export function SiteNav() {
  const { me, setMe, data, offline } = useLedger();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  async function logout() {
    await send('/api/auth/logout');
    setMe(null);
    router.push('/');
  }

  const links: [string, string][] = [
    ['/needs', 'Needs'],
    ['/donations', 'Donations ledger'],
    ['/#how', 'How it works'],
    ...(me?.coordinatorId ? ([['/post', 'Post a need']] as [string, string][]) : []),
  ];
  const on = (href: string) => (href.startsWith('/#') ? false : path === href || path.startsWith(href + '/'));

  return (
    <header className="site-head">
      <div className="strip" role="note">
        Sandbox demo: no real money moves and no real aid is delivered.
      </div>
      <div className="wrap nav">
        <Link href="/" className="brand" aria-label="Resurgence home">
          Resurgence
          {data.region && <span>{data.region.name}, {data.region.country}</span>}
        </Link>
        <button className="nav-toggle alt" aria-expanded={open} aria-controls="site-links" onClick={() => setOpen(!open)}>
          Menu
        </button>
        <nav id="site-links" className={open ? 'links open' : 'links'} aria-label="Main">
          {links.map(([href, label]) => (
            <Link key={href} href={href} aria-current={on(href) ? 'page' : undefined}>{label}</Link>
          ))}
          {me ? (
            <button className="linkbtn" onClick={logout}>Log out ({me.name})</button>
          ) : (
            <Link href="/staff" aria-current={path === '/staff' ? 'page' : undefined}>Staff login</Link>
          )}
        </nav>
      </div>
      {offline && <p className="wrap err" role="alert">Cannot reach the server. Showing the last data received.</p>}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="wrap foot-grid">
        <div>
          <p className="brand-lg">Resurgence</p>
          <p>A public ledger for disaster relief. Every need has a trail, and anything not yet proven says so.</p>
        </div>
        <nav aria-label="Footer">
          <Link href="/needs">Needs</Link>
          <Link href="/donations">Donations ledger</Link>
          <Link href="/#how">How it works</Link>
          <Link href="/staff">Staff login</Link>
        </nav>
        <div>
          <p>Prototype built for the PayPal Hackathon 2026. Sandbox only; supplier payouts are simulated.</p>
          <p>
            <a href="https://github.com/rudra-agr/resurgence" rel="noopener noreferrer">Source on GitHub</a> · MIT licence
          </p>
        </div>
      </div>
    </footer>
  );
}
