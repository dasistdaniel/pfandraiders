import type { GameState } from '@pfandraiders/core';
import type { MusicMode } from './music/score';

/**
 * Countdown vor jeder Runde (5, 4, 3, 2, 1, LOS!). Reines Modul ohne Phaser: Anzeige-Text und Musikmodus
 * aus dem Zustand, lokal und online gleich (online kommt countdownMs mit jedem Snapshot).
 */

/** So lange (ms) steht "LOS!" nach dem Ende des Countdowns. */
export const GO_SHOW_MS = 600;
export const GO_TEXT = 'LOS!';

/** Restzeit des Countdowns; fehlend (älterer Server) oder ungültig = vorbei. */
export function countdownLeft(state: Pick<GameState, 'countdownMs'>): number {
  const ms = state.countdownMs;
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : 0;
}

/** Text der großen Countdown-Anzeige. Merkt sich den Übergang auf 0, um danach kurz "LOS!" zu zeigen. */
export class CountdownDisplay {
  private prevMs = 0;
  private goLeftMs = 0;

  /**
   * Ein Frame. `dtMs` = vergangene Anzeigezeit (lokal pausiert 0, dann bleibt "LOS!" stehen).
   * Liefert "5" bis "1", "LOS!" oder '' (nichts anzeigen).
   */
  update(countdownMs: number | undefined, dtMs: number, phase: GameState['phase'] = 'running'): string {
    const left = countdownLeft({ countdownMs: countdownMs as number });
    const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
    const wasCounting = this.prevMs > 0;
    this.prevMs = left;
    if (phase === 'ended') {
      this.goLeftMs = 0;
      return '';
    }
    if (left > 0) {
      this.goLeftMs = 0;
      return String(Math.ceil(left / 1000));
    }
    if (wasCounting) this.goLeftMs = GO_SHOW_MS;
    else this.goLeftMs = Math.max(0, this.goLeftMs - dt);
    return this.goLeftMs > 0 ? GO_TEXT : '';
  }
}

/**
 * Musikmodus im Spiel: nach Rundenende und in der lokalen Pause ruhig ('ended'). Während des Countdowns
 * bleibt die bisherige Musik (null = nicht ändern: Menümusik bzw. die ruhige Musik seit dem letzten Rundenende), mit "LOS!" beginnt die Spielmusik.
 */
export function musicModeFor(state: GameState, paused: boolean): MusicMode | null {
  if (state.phase === 'ended' || paused) return 'ended';
  if (countdownLeft(state) > 0) return null;
  return 'game';
}
