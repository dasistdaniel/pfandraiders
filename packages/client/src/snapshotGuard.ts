import type { Snapshot } from '@pfandraiders/core';

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function fin(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function nonNegInt(x: unknown): boolean {
  return fin(x) && Number.isInteger(x) && x >= 0;
}

/** Prüft die Form eines vom Server empfangenen Snapshots, bevor er gepuffert oder gerendert wird. */
export function isValidSnapshot(x: unknown): x is Snapshot {
  if (!isObj(x)) return false;
  if (!fin(x.tick) || x.tick < 0 || !fin(x.timeLeftMs)) return false;
  if (x.phase !== 'running' && x.phase !== 'ended') return false;
  if (!isObj(x.players)) return false;
  for (const p of Object.values(x.players)) {
    if (!isObj(p) || typeof p.id !== 'string') return false;
    if (!fin(p.x) || !fin(p.y) || !fin(p.money) || !fin(p.health)) return false;
    if (!nonNegInt(p.containerLevel)) return false;
  }
  if (!Array.isArray(x.spots) || !Array.isArray(x.npcs) || !Array.isArray(x.zones)) return false;
  for (const s of x.spots) {
    if (!isObj(s) || !isObj(s.contents)) return false;
  }
  for (const n of x.npcs) {
    if (!isObj(n) || !fin(n.id) || !fin(n.x) || !fin(n.y)) return false;
    if (n.kind !== 'dog' && n.kind !== 'police') return false;
  }
  for (const z of x.zones) {
    if (!isObj(z) || !isObj(z.def)) return false;
    if (z.phase !== 'idle' && z.phase !== 'announced' && z.phase !== 'active') return false;
  }
  return true;
}
