import type { Snapshot } from '@pfandraiders/core';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Mischt Positionen fremder Spieler und der NPCs zwischen zwei älteren Snapshots,
 * alle anderen Felder kommen aus dem neuesten Snapshot. Die eigene Figur bleibt
 * ohne Verzögerung an der Position des neuesten Snapshots. Verändert keine Eingabe.
 */
export function interpolateSnapshot(
  older: Snapshot,
  newer: Snapshot,
  alpha: number,
  latest: Snapshot,
  youId: string,
): Snapshot {
  const t = Math.min(1, Math.max(0, alpha));

  const players: Snapshot['players'] = {};
  for (const [id, p] of Object.entries(latest.players)) {
    const a = older.players[id];
    const b = newer.players[id];
    players[id] = id === youId || !a || !b ? p : { ...p, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  }

  const npcs = latest.npcs.map((n) => {
    const a = older.npcs.find((x) => x.id === n.id);
    const b = newer.npcs.find((x) => x.id === n.id);
    return !a || !b ? n : { ...n, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  });

  return { ...latest, players, npcs };
}

/** Zeitkonstante, mit der die eigene Figur zur Serverposition gleitet (ms). */
export const OWN_SMOOTH_TAU_MS = 60;
/** Weiter als so viele Pixel entfernt springt die eigene Figur direkt (Respawn, Treffer, Neustart). */
export const OWN_SNAP_DIST = 32;

export interface Pos {
  x: number;
  y: number;
}

/**
 * Glättet die eigene Figur: Server-Snapshots kommen nur 20-mal pro Sekunde, die Anzeige läuft mit 60 und mehr
 * Bildern. Statt in 20-Hz-Stufen zu springen, gleitet die Figur exponentiell zum Ziel (Zeitkonstante tauMs).
 * Ohne bisherige Position oder bei großem Abstand springt sie direkt. Reine Funktion, ungültige Werte
 * (NaN, negative Zeit) ergeben das Ziel oder die bisherige Position.
 */
export function smoothPosition(
  current: Pos | null,
  target: Pos,
  dtMs: number,
  tauMs = OWN_SMOOTH_TAU_MS,
  snapDist = OWN_SNAP_DIST,
): Pos {
  if (current === null || !Number.isFinite(current.x) || !Number.isFinite(current.y)) return { x: target.x, y: target.y };
  const dist = Math.hypot(target.x - current.x, target.y - current.y);
  if (!(dist <= snapDist)) return { x: target.x, y: target.y };
  if (!(dtMs > 0) || !(tauMs > 0)) return dtMs > 0 ? { x: target.x, y: target.y } : { x: current.x, y: current.y };
  const k = 1 - Math.exp(-dtMs / tauMs);
  return { x: current.x + (target.x - current.x) * k, y: current.y + (target.y - current.y) * k };
}
