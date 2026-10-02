/** Cent als "1,50 €" */
export function formatMoney(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return `${euros},${String(rest).padStart(2, '0')} €`;
}

/** Millisekunden als "m:ss", aufgerundet auf volle Sekunden */
export function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
