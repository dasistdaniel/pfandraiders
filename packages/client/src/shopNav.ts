import type { KeyState } from './input';
import type { ShopDir } from './shopModel';
import type { TabLabels } from './sources';

export type ShopNavCommand = ShopDir | 'confirm' | 'prevCategory' | 'nextCategory';

/** Gehaltene Richtung wiederholt sich nach so langer Zeit ... */
export const NAV_REPEAT_DELAY_MS = 350;
/** ... und dann in diesem Abstand (für Mengen bis 99). */
export const NAV_REPEAT_EVERY_MS = 90;

/** Wie viele Wiederholungen nach `t` ms Halten fällig sind (0 vor der Verzögerung). */
function repeats(t: number): number {
  return t < NAV_REPEAT_DELAY_MS ? 0 : Math.floor((t - NAV_REPEAT_DELAY_MS) / NAV_REPEAT_EVERY_MS) + 1;
}

/**
 * Macht aus dem Tastenzustand eines Geräts Shop-Befehle: Bewegungstasten, Aktionstaste (Spec §3.3) und die Tasten für
 * vorige/nächste Kategorie (Tastatur: Ausrauben/Schlagen, Gamepad: LB/RB), die auf jeder Zeile wirken, auch auf Mengen-Zeilen.
 * Was beim ersten Frame schon gedrückt ist (etwa die Aktionstaste von der Rangliste), zählt nicht.
 */
export class ShopNav {
  private first = true;
  private dir: ShopDir | null = null;
  private heldMs = 0;
  private prevAction = false;
  private prevTabPrev = false;
  private prevTabNext = false;

  update(k: KeyState, dtMs: number): ShopNavCommand[] {
    // Aus der Runde gehaltene Richtungstasten zählen erst nach dem Loslassen (wie die Aktionstaste)
    const on = (d: ShopDir): boolean => k[d] && k.heldOver?.[d] !== true;
    const dir: ShopDir | null = on('up') ? 'up' : on('down') ? 'down' : on('left') ? 'left' : on('right') ? 'right' : null;
    const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
    if (this.first) {
      this.first = false;
      this.dir = dir;
      this.heldMs = 0;
      this.prevAction = k.action;
      this.prevTabPrev = k.tabPrev;
      this.prevTabNext = k.tabNext;
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
    // Kategorie nur bei neuem Druck, ohne Wiederholung
    if (k.tabPrev && !this.prevTabPrev) out.push('prevCategory');
    if (k.tabNext && !this.prevTabNext) out.push('nextCategory');
    this.prevTabPrev = k.tabPrev;
    this.prevTabNext = k.tabNext;
    if (k.action && !this.prevAction) out.push('confirm');
    this.prevAction = k.action;
    return out;
  }
}

/** Hinweiszeile unten im Shop-Feld mit den Tasten des eigenen Geräts. */
export function shopHint(action: string, tabs: TabLabels): string {
  return `Hoch/runter: wählen   Links/rechts: Kategorie oder Menge   ${tabs.prev} ${tabs.next}: Kategorie   ${action}: kaufen / bereit   Esc: verlassen`;
}
