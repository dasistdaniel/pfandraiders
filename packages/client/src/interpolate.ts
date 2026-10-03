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
