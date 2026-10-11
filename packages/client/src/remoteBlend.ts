import type { Snapshot } from '@pfandraiders/core';

/**
 * Sanfter Übergang für fremde Figuren (docs/NETZ.md, Befund 3): Wurde fortgeschrieben oder gehalten und kommen dann
 * neue Snapshots, liegt die richtige Position meist etwas anders. Statt zu springen, wird der Unterschied zur
 * zuletzt gezeigten Position über BLEND_MS linear abgebaut. Größere Sprünge (Respawn, Teleport) werden direkt
 * gezeigt. Die eigene Figur bleibt unberührt (sie kommt aus der Vorhersage). Reines Modul ohne Phaser und DOM.
 */

/** Dauer des Übergangs (ms) */
export const BLEND_MS = 100;
/** Weiter als so viele Pixel springt die Figur direkt (px) */
export const BLEND_MAX_PX = 48;

interface Pos {
  x: number;
  y: number;
}

export class RemoteBlend {
  /** zuletzt gezeigte Position je Figur ("p:id" bzw. "n:id") */
  private shown = new Map<string, Pos>();
  /** Unterschied gezeigt - Ziel beim Start des Übergangs */
  private offsets = new Map<string, Pos>();
  private left = 0;

  reset(): void {
    this.shown.clear();
    this.offsets.clear();
    this.left = 0;
  }

  /**
   * Positionen für diesen Frame. `jump` = die Anzeige springt hier vermutlich (eben noch fortgeschrieben, jetzt
   * neue Daten): dann beginnt ein Übergang von der zuletzt gezeigten Position aus. Gibt `snap` selbst zurück,
   * wenn nichts zu tun ist; verändert keine Eingabe.
   */
  apply(snap: Snapshot, youId: string, dtMs: number, jump: boolean): Snapshot {
    const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
    if (jump) {
      this.offsets.clear();
      const start = (key: string, p: Pos) => {
        const prev = this.shown.get(key);
        if (!prev) return;
        const dx = prev.x - p.x;
        const dy = prev.y - p.y;
        if ((dx !== 0 || dy !== 0) && Math.hypot(dx, dy) <= BLEND_MAX_PX) this.offsets.set(key, { x: dx, y: dy });
      };
      for (const [id, p] of Object.entries(snap.players)) if (id !== youId) start(`p:${id}`, p);
      for (const n of snap.npcs) start(`n:${n.id}`, n);
      this.left = BLEND_MS;
    }
    this.left = Math.max(0, this.left - dt);
    if (this.left === 0) this.offsets.clear();

    let out = snap;
    if (this.offsets.size > 0) {
      const k = this.left / BLEND_MS;
      const move = <T extends Pos>(key: string, p: T): T => {
        const o = this.offsets.get(key);
        return o ? { ...p, x: p.x + o.x * k, y: p.y + o.y * k } : p;
      };
      const players: Snapshot['players'] = {};
      for (const [id, p] of Object.entries(snap.players)) players[id] = id === youId ? p : move(`p:${id}`, p);
      out = { ...snap, players, npcs: snap.npcs.map((n) => move(`n:${n.id}`, n)) };
    }

    this.shown.clear();
    for (const [id, p] of Object.entries(out.players)) if (id !== youId) this.shown.set(`p:${id}`, { x: p.x, y: p.y });
    for (const n of out.npcs) this.shown.set(`n:${n.id}`, { x: n.x, y: n.y });
    return out;
  }
}
