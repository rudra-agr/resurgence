// SECURITY: the public ledger shows only masked payment references and payer names.
// Same JSON keys as before, so the UI keeps working.
export const maskId = (id: string): string => `…${id.slice(-4)}`;

export function maskPayer(name: string): string {
  const t = name.trim();
  if (!t || t === 'Anonymous') return 'Anonymous';
  return `${[...t][0].toUpperCase()}.`; // first initial, unicode-safe
}
