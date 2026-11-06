import { usd } from '@/lib/fx';

// Dollar equivalent in brackets, shown next to a rupee figure.
export function Usd({ npr }: { npr: number }) {
  return <span className="s-usd">(≈ {usd(npr)})</span>;
}
