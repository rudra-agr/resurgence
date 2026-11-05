'use client';

import { DisasterBanner } from '@/app/components/DisasterBanner';
import '@/app/components/banner.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { send } from '@/lib/client';
import { pctOf, proofSteps, sortNeeds } from '@/lib/ledger';
import type { EventRow } from '@/lib/types';
import Overview from './Overview';
import ProofTrail from './ProofTrail';
import { useLedger } from './Providers';

const HOW = [
  ['A coordinator posts a need', 'Local coordinators list what is needed and how many families it serves. Nothing is treated as proven until it is.'],
  ['Real products are priced', 'The app searches live retailers through Channel3. The coordinator approves one product per item, or enters one by hand, labelled MANUAL.'],
  ['Donors pay', 'Payments go through PayPal (sandbox here). Each captured payment is counted once and shown with a masked reference.'],
  ['Evidence closes the loop', 'Purchase and delivery stay unverified until an admin records evidence. The ledger never marks a stage done on its own.'],
];

const NOT_CLAIMED = [
  'No real money moves. Payments use PayPal’s sandbox.',
  'Supplier payouts are simulated.',
  'Authority verification is a mock label, not a real check.',
  'Purchase and delivery evidence is test evidence entered by an admin.',
];

export default function Home() {
  const { data, money } = useLedger();
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);

  const featured = useMemo(() => sortNeeds(data.needs)[0] ?? null, [data.needs]);
  useEffect(() => {
    if (!featured) return setEvents([]);
    send(`/api/needs/${featured.id}/events`, undefined, 'GET').then(({ ok, j }) => ok && setEvents(j));
  }, [featured?.id, featured?.raised]); // eslint-disable-line react-hooks/exhaustive-deps

  const families = data.needs.reduce((a, n) => a + n.families, 0);
  const raised = data.needs.reduce((a, n) => a + n.raised, 0);
  const funded = data.needs.filter((n) => n.status === 'FUNDED').length;

  return (
    
    <>
    <DisasterBanner />
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="kicker">{data.region ? `${data.region.name}, ${data.region.country}` : 'Disaster relief'} · public ledger</p>
            <h1>Follow every relief dollar from request to doorstep.</h1>
            <p className="lead">
              After a major flood, money vanished into one account and no one could see where it went. Here every need has a
              public trail, and anything not yet proven says so.
            </p>
            <div className="actions">
              <Link href="/needs" className="btn">Browse needs</Link>
              <Link href="/#how" className="btn btn-ghost">How it works</Link>
            </div>
          </div>

          <aside className="feature" aria-label="Live example from the ledger">
            <p className="kicker">Live from the ledger</p>
            {featured ? (
              <>
                <h2>{featured.title}</h2>
                <p className="note">
                  {featured.location} · {featured.families} families · {featured.urgency}
                </p>
                <p className="figure">
                  {money(featured.raised)} <span>of {featured.target > 0 ? money(featured.target) : 'not priced yet'}</span>
                </p>
                {featured.target > 0 && (
                  <div className="meter" role="img" aria-label={`${Math.round(pctOf(featured))}% funded`}>
                    <span style={{ width: `${pctOf(featured)}%` }} />
                  </div>
                )}
                <ProofTrail steps={proofSteps(featured, events)} />
                <Link href={`/needs/${featured.id}`} className="more">Open the full trail →</Link>
              </>
            ) : (
              <p className="note">No needs have been listed yet.</p>
            )}
          </aside>
        </div>

        <dl className="wrap stats">
          <div><dt>Needs listed</dt><dd>{data.needs.length}</dd></div>
          <div><dt>Families listed</dt><dd>{families}</dd></div>
          <div><dt>Raised (sandbox)</dt><dd>{money(raised)}</dd></div>
          <div><dt>Fully funded</dt><dd>{funded} of {data.needs.length}</dd></div>
        </dl>
      </section>

      <section className="band band-rule" id="how" aria-labelledby="how-h">
        <div className="wrap">
          <p className="kicker">How it works</p>
          <h2 id="how-h" className="section-title">From a request to evidence, in four steps</h2>
          <ol className="how">
            {HOW.map(([t, d], i) => (
              <li key={t}>
                <span className="num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="band band-rule" aria-labelledby="ledger-h">
        <div className="wrap">
          <p className="kicker">The ledger, live</p>
          <h2 id="ledger-h" className="section-title">What is needed, and where the money stands</h2>
          <Overview needs={data.needs} donations={data.donations} money={money} onPick={(id) => router.push(`/needs/${id}`)} />
          <p><Link href="/needs" className="more">Open the full needs ledger →</Link></p>
        </div>
      </section>

      <section className="band band-ink" aria-labelledby="honest-h">
        <div className="wrap split">
          <div>
            <p className="kicker">Honesty first</p>
            <h2 id="honest-h" className="section-title">What this prototype does not claim</h2>
          </div>
          <ul className="plain">
            {NOT_CLAIMED.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="band" aria-labelledby="cta-h">
        <div className="wrap split">
          <div>
            <h2 id="cta-h" className="section-title">See what a donation would buy</h2>
            <p className="lead">Pick a need, read its proof trail, and try a sandbox donation. No account needed.</p>
          </div>
          <div className="actions">
            <Link href="/needs" className="btn">Browse needs</Link>
            <Link href="/staff" className="btn btn-ghost">Coordinator login</Link>
          </div>
        </div>
      </section>
    </>
  );
}
