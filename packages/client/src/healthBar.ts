/**
 * Lebensbalken: über jeder Figur (nur wenn nicht voll) und fest im eigenen HUD. Reines Modul ohne Phaser.
 * Gerechnet wird mit dem aufgerundeten Wert wie in der HUD-Zeile "Leben 73/100", damit Balken und Zahl
 * zusammenpassen (Hunger zieht jeden Tick Bruchteile ab).
 * Ausgeknockte haben 0 Leben: Ihr Balken bleibt sichtbar, aber leer (nur Rahmen), so sieht man sofort, wer liegt.
 */

export const HEALTH_COLORS = { good: 0x66bb6a, mid: 0xffee58, low: 0xef5350 } as const;

export interface HealthBarView {
  /** Über der Figur zeigen? Nur unter dem Maximum. */
  visible: boolean;
  /** Füllung 0 bis 1 */
  fraction: number;
  color: number;
  /** aufgerundeter Wert, 0 bis max */
  value: number;
}

function rounded(health: number, max: number): number {
  return Math.min(max, Math.max(0, Math.ceil(health)));
}

/** Grün über 60 %, gelb über 30 %, sonst rot. Ungültige Werte: unsichtbar. */
export function healthBar(health: number, max: number): HealthBarView {
  if (!Number.isFinite(health) || !Number.isFinite(max) || max <= 0) {
    return { visible: false, fraction: 0, color: HEALTH_COLORS.low, value: 0 };
  }
  const value = rounded(health, max);
  const fraction = value / max;
  const color = fraction > 0.6 ? HEALTH_COLORS.good : fraction > 0.3 ? HEALTH_COLORS.mid : HEALTH_COLORS.low;
  return { visible: value < max, fraction, color, value };
}

/** Zahl im HUD-Balken: "73/100". */
export function healthLabel(health: number, max: number): string {
  const value = Number.isFinite(health) && Number.isFinite(max) ? rounded(health, max) : 0;
  return `${value}/${max}`;
}
