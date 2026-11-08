import type { EventRow, NeedRow } from './types';

// Shared ledger helpers. Previously duplicated across page.tsx, Overview.tsx and ProductPanel.tsx.
export const URGENCY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
export const STAGES = ['Not priced', 'Unfunded', 'Partial', 'Funded'];

export const LABEL: Record<string, string> = {
  SUBMITTED: 'Needs review: submitted',
  PRODUCTS_MATCHED: 'Approved: products matched',
  PARTIALLY_FUNDED: 'Partially funded',
  FUNDED: 'Funded (sandbox payment confirmed)',
  PAYMENT_FAILED: 'Payment not completed',
  PURCHASED: 'Purchased',
  DELIVERED: 'Delivered',
  SITUATION_UPDATE: 'Situation update',
  COORDINATOR_READY: 'Ready for dispatch',
};

export const slug = (v: string) => v.toLowerCase().replace(/\s+/g, '-');

export const stageOf = (n: NeedRow) =>
  n.target <= 0 ? 'Not priced' : n.status === 'FUNDED' ? 'Funded' : n.raised > 0 ? 'Partial' : 'Unfunded';

export const pctOf = (n: NeedRow) => (n.target > 0 ? Math.min(100, (n.raised / n.target) * 100) : 0);

export const makeMoney = (cur: string) => (v: number) =>
  new Intl.NumberFormat('en', { style: 'currency', currency: cur }).format(v);

export const sortNeeds = (needs: NeedRow[]) =>
  [...needs].sort(
    (a, b) =>
      (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9) ||
      Number(a.status === 'FUNDED') - Number(b.status === 'FUNDED')
  );

export type ProofStep = { label: string; done: boolean; note: string };

// A stage is only "done" when the data proves it. Purchase and delivery need an evidence event.
export function proofSteps(n: NeedRow, events: EventRow[]): ProofStep[] {
  const has = (t: string) => events.some((e) => e.type === t);
  const pct = pctOf(n);
  return [
    { label: 'Requested', done: true, note: 'Recorded' },
    { label: 'Priced', done: n.target > 0, note: n.target > 0 ? 'Approved' : 'Pending' },
    { label: 'Funded', done: n.status === 'FUNDED', note: n.status === 'FUNDED' ? 'Sandbox' : n.raised > 0 ? `${Math.round(pct)}%` : 'Pending' },
    { label: 'Purchased', done: has('PURCHASED'), note: has('PURCHASED') ? 'Test evidence' : 'Unverified' },
    { label: 'Delivered', done: has('DELIVERED'), note: has('DELIVERED') ? 'Test evidence' : 'Unverified' },
  ];
}
