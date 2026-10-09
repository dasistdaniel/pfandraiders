import { freshProgress, progressAfterRound, progressOf, shopBuy } from '@pfandraiders/core';
import type { BuyResult, GameState, Progress } from '@pfandraiders/core';

/** Shop-Phase im lokalen Spiel: Fortschritt und "bereit" je lokalem Spieler. Rein, ohne Phaser. */
export class LocalShop {
  private readonly own = new Map<string, Progress>();
  private readonly ready = new Map<string, boolean>();

  constructor(
    private readonly ids: string[],
    progress: Record<string, Progress>,
  ) {
    for (const id of ids) {
      this.own.set(id, progressOf(Object.hasOwn(progress, id) ? progress[id] : freshProgress()));
      this.ready.set(id, false);
    }
  }

  /** Fortschritt aller lokalen Spieler aus dem Zustand am Rundenende (tiefe Kopie, ohne Mietsachen). */
  static fromState(state: GameState, ids: string[]): Record<string, Progress> {
    const out: Record<string, Progress> = {};
    for (const id of ids) {
      const p = state.players[id];
      out[id] = p ? progressAfterRound(p) : freshProgress();
    }
    return out;
  }

  progress(id: string): Progress {
    return this.own.get(id) ?? freshProgress();
  }

  isReady(id: string): boolean {
    return this.ready.get(id) ?? false;
  }

  buy(id: string, category: unknown, item: unknown, qty: unknown): BuyResult {
    const p = this.own.get(id);
    if (!p) return { ok: false, reason: 'unknown_item' };
    return shopBuy(p, category, item, qty);
  }

  setReady(id: string, ready: boolean): void {
    if (this.ready.has(id)) this.ready.set(id, ready);
  }

  allReady(): boolean {
    return this.ids.length > 0 && this.ids.every((id) => this.ready.get(id) === true);
  }

  /** Fortschritt für die nächste Runde (tiefe Kopie). */
  result(): Record<string, Progress> {
    const out: Record<string, Progress> = {};
    for (const id of this.ids) out[id] = progressOf(this.progress(id));
    return out;
  }
}
