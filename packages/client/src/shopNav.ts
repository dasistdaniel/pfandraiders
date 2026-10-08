import type { KeyState } from './input';
import type { ShopDir } from './shopModel';

export type ShopNavCommand = ShopDir | 'confirm';

/** Gehaltene Richtung wiederholt sich nach so langer Zeit ... */
export const NAV_REPEAT_DELAY_MS = 350;
/** ... und dann in diesem Abstand (für Mengen bis 99). */
export const NAV_REPEAT_EVERY_MS = 90;

/** Wie viele Wiederholungen nach `t` ms Halten fällig sind (0 vor der Verzögerung). */
function repeats(t: number): number {
  return t < NAV_REPEAT_DELAY_MS ? 0 : Math.floor((t - NAV_REPEAT_DELAY_MS) / NAV_REPEAT_EVERY_MS) + 1;
}

/**
 * Macht aus dem Tastenzustand eines Geräts Shop-Befehle: nur Bewegungstasten und die Aktionstaste (Spec §3.3).
 * Was beim ersten Frame schon gedrückt ist (etwa die Aktionstaste von der Rangliste), zählt nicht.
 */
export class ShopNav {
  private first = true;
  private dir: ShopDir | null = null;
  private heldMs = 0;
  private prevAction = false;

  update(k: KeyState, dtMs: number): ShopNavCommand[] {
    const dir: ShopDir | null = k.up ? 'up' : k.down ? 'down' : k.left ? 'left' : k.right ? 'right' : null;
    const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
    if (this.first) {
      this.first = false;
      this.dir = dir;
      this.heldMs = 0;
      this.prevAction = k.action;
      // gehaltene Richtung vom Vorbild zählt erst nach dem Loslassen
      if (dir !== null) this.heldMs = -Infinity;
      return [];
    }
    const out: ShopNavCommand[] = [];
    if (dir === null) {
      this.dir = null;
    } else if (dir !== this.dir) {
      this.dir = dir;
      this.heldMs = 0;
      out.push(dir);
    } else if (this.heldMs !== -Infinity) {
      const before = this.heldMs;
      this.heldMs += dt;
      for (let i = repeats(before); i < repeats(this.heldMs); i++) out.push(dir);
    }
    if (k.action && !this.prevAction) out.push('confirm');
    this.prevAction = k.action;
    return out;
  }
}
