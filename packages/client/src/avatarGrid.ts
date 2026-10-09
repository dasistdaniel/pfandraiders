import { AVATAR_COUNT } from '@pfandraiders/core';
import type { RosterEntry } from '@pfandraiders/core';
import { ALL_CHARACTERS } from './playerChars';

/** Spalten des Figurenrasters in der Lobby (24 Figuren = 3 Reihen) */
export const AVATAR_COLUMNS = 8;

export interface AvatarCell {
  index: number;
  /** Schlüssel des Bogens (m01..f12) */
  character: string;
  /** von einem anderen Spieler belegt */
  taken: boolean;
  /** eigene Figur */
  own: boolean;
  /** Name dessen, der sie hat (nur bei taken) */
  takenBy: string | null;
}

/** Alle Figuren in Reihenfolge, mit Belegung laut Raumliste. */
export function avatarCells(roster: readonly RosterEntry[], you: string): AvatarCell[] {
  return Array.from({ length: AVATAR_COUNT }, (_, index) => {
    const holder = roster.find((p) => p.avatar === index);
    const own = holder?.id === you;
    return {
      index,
      character: ALL_CHARACTERS[index],
      taken: holder !== undefined && !own,
      own,
      takenBy: holder && !own ? holder.name : null,
    };
  });
}

/** Figuren der anderen Spieler */
export function takenByOthers(roster: readonly RosterEntry[], you: string): Set<number> {
  return new Set(roster.filter((p) => p.id !== you).map((p) => p.avatar));
}

const DELTA: Record<string, (columns: number) => number> = {
  ArrowLeft: () => -1,
  ArrowRight: () => 1,
  ArrowUp: (c) => -c,
  ArrowDown: (c) => c,
};

/**
 * Nächste freie Figur in Pfeilrichtung (links/rechts eins, hoch/runter eine Reihe), mit Umlauf über alle 24;
 * vergebene werden übersprungen. Ist nichts frei oder keine Pfeiltaste: bleibt `current`.
 */
export function stepAvatar(current: number, key: string, taken: ReadonlySet<number>, columns = AVATAR_COLUMNS): number {
  // hasOwn: geerbte Schlüssel wie 'toString' sind keine Pfeiltasten
  const delta = Object.hasOwn(DELTA, key) ? DELTA[key](columns) : undefined;
  if (delta === undefined) return current;
  let i = current;
  for (let n = 0; n < AVATAR_COUNT; n++) {
    i = (((i + delta) % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT;
    if (i === current) return current;
    if (!taken.has(i)) return i;
  }
  return current;
}
