/**
 * Anzeigeverzögerung für fremde Figuren, die sich nach der Leitung richtet (docs/NETZ.md, Befund 3).
 *
 * Gemessen wird die Verspätung jedes Snapshots gegenüber der Zeitachse (`ServerTimeline.noteSnapshot`), geglättet
 * als gleitendes Mittel. Daraus das Ziel
 *   clamp(BASE_DELAY_MS + JITTER_K · max(0, Jitter − JITTER_FREE_MS), BASE_DELAY_MS, MAX_DELAY_MS),
 * gleichbedeutend mit clamp(50 + 2 · Jitter, 100, 250). Die Grundverzögerung von 100 ms deckt schon zwei Takte und
 * etwa 25 ms Verspätung ab (Raster von Frames und Server-Timer); erst darüber wächst sie. Auf ruhiger Leitung bleibt
 * sie deshalb genau bei 100 ms.
 *
 * Die Verzögerung selbst wächst höchstens um GROW_PER_MS je ms (fremde Figuren laufen dann langsamer, aber nie
 * rückwärts) und schrumpft um SHRINK_PER_MS (10 ms pro Sekunde), damit sie zwischen zwei Staus nicht gleich
 * wieder zu knapp wird. Staus, die länger sind als das Fenster der Verspätung (LATE_WINDOW_MS in timeline.ts),
 * zählen über die offene Lücke (wie spät der nächste Tick schon ist): Ab OPEN_GAP_FREE_MS wächst die Verzögerung
 * schon im Stau und nicht erst, wenn die gehaltenen Snapshots ankommen. Kürzere Lücken (etwa ein Hänger des
 * Server-Timers) überbrückt das Fortschreiben, ohne dass die Verzögerung für Sekunden steigt.
 *
 * Reines Modul ohne Uhr: Frames und Verspätungen werden übergeben.
 */

export const BASE_DELAY_MS = 100;
export const MAX_DELAY_MS = 250;
/** Gewicht der Abweichung über der freien Verspätung */
export const JITTER_K = 2;
/** So viel mittlere Verspätung deckt die Grundverzögerung schon ab (ms) */
export const JITTER_FREE_MS = 25;
/** Glättung je Snapshot (gleitendes Mittel der Verspätung) */
export const JITTER_GAIN = 1 / 16;
/** Offene Lücke zählt ab hier und zur Hälfte als Jitter (ms); kürzere Lücken überbrückt das Fortschreiben */
export const OPEN_GAP_FREE_MS = 100;
export const OPEN_GAP_WEIGHT = 0.5;
/** Höchstes Wachsen bzw. Schrumpfen der Verzögerung je ms Uhr */
export const GROW_PER_MS = 0.5;
export const SHRINK_PER_MS = 0.01;

export class DelayController {
  /** geglättete Verspätung der Snapshots (ms) */
  jitterMs = 0;
  /** aktuelle Anzeigeverzögerung fremder Figuren (ms) */
  delayMs = BASE_DELAY_MS;

  reset(): void {
    this.jitterMs = 0;
    this.delayMs = BASE_DELAY_MS;
  }

  /** Ein Snapshot kam mit dieser Verspätung gegenüber der Zeitachse an (ms; früher zählt wie pünktlich). */
  observe(latenessMs: number): void {
    if (!Number.isFinite(latenessMs)) return;
    const l = Math.max(0, latenessMs);
    this.jitterMs += JITTER_GAIN * (l - this.jitterMs);
  }

  /** Zielverzögerung; `openGapMs` = wie viel später als erwartet der nächste Tick schon ist. */
  targetMs(openGapMs = 0): number {
    const open = Number.isFinite(openGapMs) ? Math.max(0, openGapMs - OPEN_GAP_FREE_MS) * OPEN_GAP_WEIGHT : 0;
    const j = Math.max(this.jitterMs, open);
    return Math.min(MAX_DELAY_MS, Math.max(BASE_DELAY_MS, BASE_DELAY_MS + JITTER_K * Math.max(0, j - JITTER_FREE_MS)));
  }

  /** Ein Frame von `dtMs`: die Verzögerung rückt an das Ziel heran. */
  step(dtMs: number, openGapMs = 0): void {
    const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
    const target = this.targetMs(openGapMs);
    if (target > this.delayMs) this.delayMs = Math.min(target, this.delayMs + GROW_PER_MS * dt);
    else this.delayMs = Math.max(target, this.delayMs - SHRINK_PER_MS * dt);
  }
}
