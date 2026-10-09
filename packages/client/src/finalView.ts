import { finalRanking } from '@pfandraiders/core';
import type { RankEntry, RoomPhase, RosterEntry } from '@pfandraiders/core';

/** Grau für Spieler, die den Raum verlassen haben */
const LEFT_COLOR = 0x888888;

export interface FinalRow {
  /** Platz; gleicher Gesamtverdienst teilt sich den Platz (1, 1, 3) */
  place: number;
  id: string;
  name: string;
  /** Gesamtverdienst (Cent) */
  total: number;
  /** Figur aus der Raumliste; null = nicht mehr im Raum */
  avatar: number | null;
  color: number;
  isWinner: boolean;
  isViewer: boolean;
  /** hat den Raum verlassen */
  left: boolean;
}

/** Zeilen der Endwertung: nach Gesamtverdienst (finalRanking), Namen/Figuren/Farben aus der Raumliste. */
export function finalRows(entries: readonly RankEntry[], roster: readonly RosterEntry[], you: string): FinalRow[] {
  const rows: FinalRow[] = [];
  finalRanking(entries).forEach((entry, i) => {
    const place = i > 0 && rows[i - 1].total === entry.total ? rows[i - 1].place : i + 1;
    const member = roster.find((p) => p.id === entry.id);
    rows.push({
      place,
      id: entry.id,
      name: member ? member.name : '(gegangen)',
      total: entry.total,
      avatar: member ? member.avatar : null,
      color: member ? member.color : LEFT_COLOR,
      isWinner: place === 1,
      isViewer: entry.id === you,
      left: !member,
    });
  });
  return rows;
}

/** "Gesamtsieger: Anna", "… Anna und Bob", "… Anna, Bob und Cara"; ohne Zeilen "Keine Wertung". */
export function winnerText(rows: readonly FinalRow[]): string {
  const names = rows.filter((r) => r.isWinner).map((r) => r.name);
  if (names.length === 0) return 'Keine Wertung';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
  return `Gesamtsieger: ${list}`;
}

/** Fußzeile der Endwertung: Host holt alle zurück in die Lobby, die anderen warten. */
export function finalFooter(isHost: boolean, actionLabel: string): string[] {
  const first = isHost ? `Zur Lobby: ${actionLabel} oder Klick` : 'Warte auf den Host…';
  return [first, 'Raum verlassen: Esc'];
}

export type OnlineScene = 'game' | 'shop' | 'final';

/** Szene nach dem Online-Dialog: Endwertung, Shop (mit eigenem Stand) oder Spiel. */
export function sceneForPhase(phase: RoomPhase, hasShopState: boolean): OnlineScene {
  if (phase === 'final') return 'final';
  if (phase === 'shop' && hasShopState) return 'shop';
  return 'game';
}
