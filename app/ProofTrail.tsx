import type { ProofStep } from '@/lib/ledger';

// The five proof stages. Used on the landing page and on each need's page.
export default function ProofTrail({ steps }: { steps: ProofStep[] }) {
  return (
    <ol className="proof" aria-label="Proof of aid">
      {steps.map((s) => (
        <li key={s.label} className={s.done ? 'done' : 'todo'}>
          <span>{s.label}</span>
          <small>{s.note}</small>
        </li>
      ))}
    </ol>
  );
}
