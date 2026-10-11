import type { Snapshot } from '@pfandraiders/core';
import { SERVER_STEP_MS } from './prediction';

/**
 * Fortschreiben fremder Figuren, wenn die Anzeigezeit hinter dem neuesten Snapshot liegt (Stau, docs/NETZ.md
 * Befund 3). Statt stehen zu bleiben, laufen Spieler und NPCs mit ihrer letzten Geschwindigkeit weiter, aber
 * höchstens MAX_EXTRAP_MS; danach halten sie. Reines Modul ohne Phaser und DOM.
 */

/** So lange wird höchstens fortgeschrieben (ms Anzeigezeit) */
export const MAX_EXTRAP_MS = 150;
/** Schneller (px pro Sekunde Spielzeit) ist kein Laufen, sondern ein Sprung (Respawn, Teleport): nicht fortschreiben */
export const MAX_EXTRAP_SPEED = 300;

/** Ticks hinter dem neuesten Snapshot, die fortgeschrieben werden (0 .. MAX_EXTRAP_MS). */
export function extrapolationTicks(renderTick: number, newestTick: number, msPerTick: number): number {
  if (!Number.isFinite(renderTick) || !Number.isFinite(newestTick) || !(msPerTick > 0)) return 0;
  return Math.min(Math.max(0, renderTick - newestTick), MAX_EXTRAP_MS / msPerTick);
}

function ahead(a: { x: number; y: number }, b: { x: number; y: number }, ticks: number, span: number): { x: number; y: number } {
  const vx = (b.x - a.x) / span;
  const vy = (b.y - a.y) / span;
  // Geschwindigkeit in px pro Sekunde Spielzeit (ein Tick = SERVER_STEP_MS)
  if (Math.hypot(vx, vy) * (1000 / SERVER_STEP_MS) > MAX_EXTRAP_SPEED) return { x: b.x, y: b.y };
  return { x: b.x + vx * ticks, y: b.y + vy * ticks };
}

/**
 * Positionen fremder Spieler und NPCs `ticks` Ticks hinter `newer`, mit der Geschwindigkeit zwischen `older` und
 * `newer`. Alle anderen Felder und die eigene Figur kommen unverändert aus `newer`. Verändert keine Eingabe.
 */
export function extrapolateSnapshot(older: Snapshot, newer: Snapshot, ticks: number, youId: string): Snapshot {
  const span = newer.tick - older.tick;
  if (!(ticks > 0) || !(span > 0)) return newer;

  const players: Snapshot['players'] = {};
  for (const [id, p] of Object.entries(newer.players)) {
    const a = older.players[id];
    players[id] = id === youId || !a ? p : { ...p, ...ahead(a, p, ticks, span) };
  }

  const npcs = newer.npcs.map((n) => {
    const a = older.npcs.find((x) => x.id === n.id);
    return a ? { ...n, ...ahead(a, n, ticks, span) } : n;
  });

  return { ...newer, players, npcs };
}
