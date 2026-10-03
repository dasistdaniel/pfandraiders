import type { ErrorCode } from '@pfandraiders/core';

/** So lange wird automatisch versucht, die Verbindung wiederherzustellen. */
export const ATTEMPT_WINDOW_MS = 30_000;
/** Abstand zwischen zwei Verbindungsversuchen. */
export const RETRY_EVERY_MS = 2_000;
/** Fehler, nach denen ein weiterer Versuch sinnlos ist. */
export const FATAL_CODES: ErrorCode[] = [
  'name_taken',
  'room_not_found',
  'not_in_room',
  'already_started',
  'room_full',
  'bad_message',
];

export type ReconnectPhase = 'trying' | 'asking' | 'gave_up';

/** Reiner Ablaufplan der Wiederverbindung, getrieben vom Frame-Delta der Szene (kein Timer). */
export class ReconnectPlan {
  phase: ReconnectPhase = 'trying';
  elapsedMs = 0;
  private nextAttemptAt = 0;

  /** Liefert 'attempt', wenn jetzt ein Verbindungsversuch fällig ist (höchstens einer pro Aufruf). */
  update(dtMs: number): 'attempt' | null {
    if (this.phase !== 'trying') return null;
    const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
    let result: 'attempt' | null = null;
    if (this.elapsedMs >= this.nextAttemptAt) {
      result = 'attempt';
      this.nextAttemptAt = this.elapsedMs + RETRY_EVERY_MS;
    }
    this.elapsedMs += dt;
    if (this.elapsedMs >= ATTEMPT_WINDOW_MS) {
      this.elapsedMs = ATTEMPT_WINDOW_MS;
      this.phase = 'asking';
    }
    return result;
  }

  continueTrying(): void {
    if (this.phase !== 'asking') return;
    this.elapsedMs = 0;
    this.nextAttemptAt = 0;
    this.phase = 'trying';
  }

  giveUp(): void {
    this.phase = 'gave_up';
  }

  /** true (und aufgegeben), wenn der Fehler endgültig ist. */
  fatal(code: ErrorCode): boolean {
    if (!FATAL_CODES.includes(code)) return false;
    this.phase = 'gave_up';
    return true;
  }

  remainingMs(): number {
    return this.phase === 'trying' ? Math.max(0, ATTEMPT_WINDOW_MS - this.elapsedMs) : 0;
  }
}
