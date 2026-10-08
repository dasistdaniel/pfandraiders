import { DEFAULT_ROUND_MS, ROUND_MS_CHOICES } from '@pfandraiders/core';

/** "3 min", "10 min"; andere Werte (ROUND_MS zum Testen) in Sekunden. */
export function roundMsLabel(ms: number): string {
  return ms % 60_000 === 0 ? `${ms / 60_000} min` : `${Math.round(ms / 1000)} s`;
}

/** Nächste bzw. vorige erlaubte Rundenzeit, ohne Umlauf; unbekannte Werte gehen vom Standard aus. */
export function stepRoundMs(ms: number, dir: -1 | 1): number {
  const i = ROUND_MS_CHOICES.indexOf(ms);
  const from = i >= 0 ? i : ROUND_MS_CHOICES.indexOf(DEFAULT_ROUND_MS);
  const to = Math.min(ROUND_MS_CHOICES.length - 1, Math.max(0, from + dir));
  return ROUND_MS_CHOICES[to];
}
