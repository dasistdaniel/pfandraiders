import { boxBlocked, CONFIG, sanitizeInput, walk } from '@pfandraiders/core';
import type { Input, MapData, Player } from '@pfandraiders/core';

/**
 * Vorhersage der eigenen Figur im Online-Spiel (client-side prediction).
 *
 * Der Client bewegt die eigene Figur sofort mit derselben Funktion wie der Server (core `walk`: Achsen getrennt,
 * weiche Kacheln, Eckengleiten). Server-Snapshots korrigieren nur Abweichungen, und zwar sanft: Sie werden mit
 * der Position verglichen, die der Client damals selbst hatte (Verlauf), nicht mit der aktuellen.
 * Reines Modul ohne Phaser und DOM.
 */

export interface Pos {
  x: number;
  y: number;
}

export interface HistoryEntry {
  t: number;
  x: number;
  y: number;
}

/** So lange (ms Client-Uhr) bleibt der Verlauf der vorhergesagten Positionen erhalten. */
export const HISTORY_MS = 2000;
/** So viele Sendezeitpunkte (seq -> Zeit) werden gemerkt. */
export const MAX_SENDS = 64;
/** Weiter als so viele Pixel daneben springt die Figur direkt (Respawn, Ohnmacht, Neustart). */
export const SNAP_DIST = 48;
/** Kleinere Abweichungen werden beim Laufen ignoriert (Takt-Raster des Servers: bis ~6 px). */
export const DEADBAND_MOVING = 6;
/** Im Stand wird schon ab so wenig Abweichung korrigiert, damit die Figur genau auf der Serverposition landet. */
export const DEADBAND_STILL = 0.5;
/** Anteil der Abweichung, der pro Snapshot ausgeglichen wird. */
export const CORRECTION_GAIN = 0.35;
/**
 * Zu welcher Client-Zeit (relativ zum Senden der bestätigten Eingabe) entspricht ein Snapshot?
 *
 * Herleitung: Die Eingabe mit Nummer `ack` geht zur Client-Zeit tA hinaus und kommt nach der Latenz L an.
 * Der nächste Server-Takt folgt 0..50 ms später (im Mittel 25) und rechnet dann gleich einen ganzen 50-ms-Schritt
 * mit der neuen Eingabe; danach geht der Snapshot (mit ack) zurück. Der Server ist damit eine Rundreise minus
 * einen halben Takt "hinter" dem Client, und die Position im Snapshot entspricht der Position, die der Client
 * etwa zur Zeit tA + ACK_OFFSET_MS hatte. Der Client trägt außerdem jeden Frame erst nach dem Laufen in den
 * Verlauf ein (die Eingabe wirkt im Verlauf also einen Frame früher als ihr Senden).
 * Genau ist das nur auf etwa einen Takt (die Phase zwischen Losgehen und Server-Takt ist unbekannt). Mit dem
 * simulierten Server (prediction.test.ts) ergaben Werte von 25 bis 50 ms zusammen mit dem Fenster unten praktisch
 * dieselben Fehler; 25 ms bleibt.
 * Snapshots mit unverändertem ack (Eingaben gehen nur alle 100 ms hinaus, Snapshots alle 50 ms) zählen von der
 * Ankunft des letzten neuen ack aus weiter.
 */
export const ACK_OFFSET_MS = 25;
/**
 * Die Zuordnung oben ist nur auf etwa einen Server-Takt genau (Phase des Takts, Frame-Raster, Jitter).
 * Verglichen wird deshalb mit dem nächstgelegenen Punkt des Verlaufs in [t - Fenster, t + Fenster]:
 * Längs der Laufrichtung zählt so nur eine Abweichung, die größer ist als der Takt.
 */
export const ACK_WINDOW_MS = 50;
/**
 * Eine Korrektur wirkt sofort auf die gerechnete Position, die angezeigte folgt ihr aber über diese Zeitkonstante
 * (ms), damit auch eine Korrektur von mehreren Pixeln nicht als Ruck sichtbar wird.
 */
export const CORRECTION_SMOOTH_MS = 40;
/** Größte Zeitspanne, die ein step() rechnet (wie MAX_FRAME_MS in OnlineConnection). */
export const MAX_PREDICT_MS = 250;
/** In höchstens so großen Teilschritten wird gelaufen (wie der Server), statt Zeit abzuschneiden. */
export const MAX_SUBSTEP_MS = 50;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Position im Verlauf zur Zeit t, linear zwischen zwei Einträgen; außerhalb des Verlaufs der Rand. null = leer. */
export function sampleHistory(history: readonly HistoryEntry[], t: number): Pos | null {
  if (history.length === 0 || !finite(t)) return null;
  const first = history[0];
  if (t <= first.t) return { x: first.x, y: first.y };
  const last = history[history.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y };
  let lo = 0;
  let hi = history.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (history[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = history[lo];
  const b = history[hi];
  const span = b.t - a.t;
  const k = span > 0 ? (t - a.t) / span : 1;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

function closestOnSegment(a: Pos, b: Pos, p: Pos): Pos {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const k = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return { x: a.x + dx * k, y: a.y + dy * k };
}

/**
 * Nächster Punkt zu `target` auf dem Weg, den der Verlauf zwischen t0 und t1 beschreibt (Strecken zwischen den
 * Einträgen, an den Fenstergrenzen interpoliert). null = leerer Verlauf.
 */
export function closestOnHistory(history: readonly HistoryEntry[], t0: number, t1: number, target: Pos): Pos | null {
  const start = sampleHistory(history, t0);
  const end = sampleHistory(history, t1);
  if (!start || !end) return null;
  const pts: Pos[] = [start];
  for (const h of history) if (h.t > t0 && h.t < t1) pts.push(h);
  pts.push(end);
  let best = start;
  let bestD = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const c = closestOnSegment(pts[i], pts[i + 1], target);
    const d = Math.hypot(c.x - target.x, c.y - target.y);
    if (d < bestD) [best, bestD] = [c, d];
  }
  return { x: best.x, y: best.y };
}

/** Verschiebt alle Einträge um (dx, dy), damit eine Korrektur bei späteren Vergleichen nicht doppelt zählt. */
export function shiftHistory(history: HistoryEntry[], dx: number, dy: number): void {
  for (const h of history) {
    h.x += dx;
    h.y += dy;
  }
}

export class Predictor {
  /** Aus: Die Figur steht immer genau an der Serverposition. */
  enabled = true;
  /** Zähler (für Tests und Fehlersuche). */
  corrections = 0;
  snaps = 0;

  private pos: Pos | null = null;
  private history: HistoryEntry[] = [];
  private sends = new Map<number, number>();
  private lastAck = -1;
  /** Zeitpunkt im Verlauf, dem der letzte Snapshot mit neuem ack entsprach, und wann er ankam. */
  private fresh: { at: number; recvAt: number } | null = null;
  /** Noch nicht angezeigter Teil der Korrekturen (angezeigt = gerechnet - offset), klingt mit CORRECTION_SMOOTH_MS ab. */
  private offset: Pos = { x: 0, y: 0 };
  /** Karte aus dem letzten step(), damit eine Korrektur die Figur nicht in eine Wand schiebt. */
  private map: MapData | null = null;

  /** Angezeigte Position der eigenen Figur. */
  get position(): Pos | null {
    return this.pos ? { x: this.pos.x - this.offset.x, y: this.pos.y - this.offset.y } : null;
  }

  /** Gerechnete Position (ohne das Ausblenden der Korrekturen). */
  get simulatedPosition(): Pos | null {
    return this.pos ? { x: this.pos.x, y: this.pos.y } : null;
  }

  /** Verlauf (nur lesen; für Tests). */
  get historyEntries(): readonly HistoryEntry[] {
    return this.history;
  }

  /** Neue Runde oder neue Verbindung: Position setzen, alles andere vergessen. */
  reset(pos: Pos | null): void {
    this.pos = pos && finite(pos.x) && finite(pos.y) ? { x: pos.x, y: pos.y } : null;
    this.history = [];
    this.sends.clear();
    this.lastAck = -1;
    this.fresh = null;
    this.offset = { x: 0, y: 0 };
  }

  /** Merkt, wann die Eingabe `seq` gesendet wurde. */
  noteSent(seq: number, nowMs: number): void {
    if (!Number.isSafeInteger(seq) || !finite(nowMs)) return;
    this.sends.set(seq, nowMs);
    while (this.sends.size > MAX_SENDS) {
      const oldest = this.sends.keys().next().value as number;
      this.sends.delete(oldest);
    }
  }

  /**
   * Ein Anzeige-Frame. `input` ist die Eingabe, die auch gesendet wird, `me` die eigene Figur aus dem neuesten
   * Snapshot (Container, Zustand), `nowMs` die Client-Uhr nach diesem Frame.
   */
  step(dtMs: number, input: Input, me: Player | undefined, map: MapData, nowMs: number): void {
    const dt = finite(dtMs) && dtMs > 0 ? Math.min(dtMs, MAX_PREDICT_MS) : 0;
    const server = me && finite(me.x) && finite(me.y) ? { x: me.x, y: me.y } : null;
    this.map = map;
    if (this.pos === null) this.pos = server;
    if (this.pos === null) return;
    if (dt > 0) {
      const k = Math.exp(-dt / CORRECTION_SMOOTH_MS);
      this.offset = Math.hypot(this.offset.x, this.offset.y) * k < 0.01 ? { x: 0, y: 0 } : { x: this.offset.x * k, y: this.offset.y * k };
    }
    if (!this.enabled || (me && (me.mode === 'unconscious' || me.unconsciousMs > 0))) {
      // Bewusstlos (oder Vorhersage aus): der Server bestimmt die Position allein
      if (server) this.pos = server;
      this.offset = { x: 0, y: 0 };
    } else if (me && dt > 0) {
      const inp = sanitizeInput(input);
      if (inp.moveX !== 0 || inp.moveY !== 0) {
        const tmp: Player = { ...me, x: this.pos.x, y: this.pos.y };
        try {
          for (let left = dt; left > 0; left -= MAX_SUBSTEP_MS) walk(map, tmp, inp, Math.min(left, MAX_SUBSTEP_MS));
          if (finite(tmp.x) && finite(tmp.y)) this.pos = { x: tmp.x, y: tmp.y };
        } catch {
          // ungültige Daten in der eigenen Figur (z. B. Containerstufe): Server übernimmt
          if (server) this.pos = server;
        }
      }
    }
    this.record(nowMs);
  }

  private record(nowMs: number): void {
    if (!this.pos || !finite(nowMs)) return;
    const last = this.history[this.history.length - 1];
    if (last && nowMs < last.t) this.history = []; // Uhr lief rückwärts: alter Verlauf ist wertlos
    if (last && nowMs === last.t) {
      last.x = this.pos.x;
      last.y = this.pos.y;
    } else {
      this.history.push({ t: nowMs, x: this.pos.x, y: this.pos.y });
    }
    const cut = nowMs - HISTORY_MS;
    let drop = 0;
    while (drop < this.history.length - 1 && this.history[drop].t < cut) drop++;
    if (drop > 0) this.history.splice(0, drop);
  }

  /**
   * Verschiebung um (dx, dy), die die Figur nicht in eine Wand oder einen weichen Kern setzt (sonst käme `walk`
   * dort nicht mehr heraus): ganz, sonst nur eine Achse. null = keine möglich (dann hilft später die Sprungregel).
   */
  private freeShift(dx: number, dy: number): [number, number] | null {
    const map = this.map;
    const pos = this.pos;
    if (!map || !pos) return [dx, dy];
    const free = (x: number, y: number) => !boxBlocked(map, x, y, CONFIG.playerHalf);
    if (!free(pos.x, pos.y)) return [dx, dy]; // steckt schon fest: jede Richtung ist besser
    for (const [cx, cy] of [
      [dx, dy],
      [dx, 0],
      [0, dy],
    ] as [number, number][]) {
      if ((cx !== 0 || cy !== 0) && free(pos.x + cx, pos.y + cy)) return [cx, cy];
    }
    return null;
  }

  /**
   * Snapshot angekommen: `server` ist die eigene Position darin, `ack` die höchste Eingabenummer, die der Server
   * bis dahin hatte, `moving` ob die aktuelle Eingabe läuft.
   */
  onSnapshot(server: Pos, ack: number, moving: boolean, nowMs: number): void {
    if (!server || !finite(server.x) || !finite(server.y) || !finite(nowMs)) return;
    const s = { x: server.x, y: server.y };
    if (this.pos === null || !this.enabled) {
      this.pos = s;
      this.offset = { x: 0, y: 0 };
      return;
    }

    // Welche Zeit im eigenen Verlauf entspricht dieser Snapshot?
    let at: number | null = null;
    const sentAt = Number.isSafeInteger(ack) ? this.sends.get(ack) : undefined;
    if (sentAt !== undefined && ack > this.lastAck) {
      at = sentAt + ACK_OFFSET_MS;
      this.lastAck = ack;
      this.fresh = { at, recvAt: nowMs };
    } else if (this.fresh && ack === this.lastAck) {
      // gleiches ack wie zuvor (Eingaben gehen nur alle 100 ms hinaus, Snapshots alle 50 ms): weiterzählen
      at = this.fresh.at + (nowMs - this.fresh.recvAt);
    }

    const ref = at === null ? null : closestOnHistory(this.history, at - ACK_WINDOW_MS, at + ACK_WINDOW_MS, s);
    const p = ref ?? this.pos;
    const ex = s.x - p.x;
    const ey = s.y - p.y;
    const dist = Math.hypot(ex, ey);
    if (dist > SNAP_DIST) {
      this.pos = s;
      this.history = [{ t: nowMs, x: s.x, y: s.y }];
      this.offset = { x: 0, y: 0 };
      this.snaps++;
      return;
    }
    if (ref === null) return; // ohne Zeitbezug nur die Sprungregel
    if (dist > (moving ? DEADBAND_MOVING : DEADBAND_STILL)) {
      const d = this.freeShift(ex * CORRECTION_GAIN, ey * CORRECTION_GAIN);
      if (!d) return;
      const [dx, dy] = d;
      this.pos = { x: this.pos.x + dx, y: this.pos.y + dy };
      shiftHistory(this.history, dx, dy);
      this.offset = { x: this.offset.x + dx, y: this.offset.y + dy };
      this.corrections++;
    }
  }
}
