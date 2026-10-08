import {
  bottlesValue,
  capacityOf,
  CONFIG,
  containerOf,
  findSearchableSpot,
  findStealTarget,
  isBeingChecked,
  isNear,
  ranking,
  totalBottles,
} from '@pfandraiders/core';
import type { GameState, Player } from '@pfandraiders/core';
import type { KeyLabels } from './sources';
import { formatMoney, formatTime } from './format';

export function playerName(id: string): string {
  return id.toUpperCase();
}

export function statusLines(state: GameState, p: Player): string[] {
  const lines = [
    `Zeit ${formatTime(state.timeLeftMs)}   Geld ${formatMoney(p.money)}`,
    `${containerOf(p).name} ${totalBottles(p.bottles)}/${capacityOf(p)}` +
      `   Pl${p.bottles.plastic} Gl${p.bottles.glass} Ka${p.bottles.crate}`,
  ];
  const health = `Leben ${Math.ceil(p.health)}/${CONFIG.health.max}`;
  lines.push(health);
  return lines;
}

export function hintLines(state: GameState, p: Player, labels: KeyLabels): string[] {
  if (state.phase === 'ended' || p.unconsciousMs > 0) return [];
  const lines: string[] = [];

  if (isNear(state.map.dropoffs, p)) {
    lines.push(
      totalBottles(p.bottles) > 0
        ? `[${labels.action} halten] Pfand abgeben (${formatMoney(bottlesValue(p.bottles))})`
        : 'Pfandautomat: nichts zum Abgeben',
    );
  }

  const full = totalBottles(p.bottles) >= capacityOf(p);
  if (findSearchableSpot(state, p)) {
    lines.push(full ? 'Container voll' : `[${labels.action} drücken, halten] Suchen`);
  }
  if (!full && findStealTarget(state, p)) {
    if (p.stealCooldownMs > 0) lines.push(`Klauen in ${Math.ceil(p.stealCooldownMs / 1000)} s`);
    else lines.push(p.inventory.bolt_cutters ? `[${labels.steal}] Bolzenschneider einsetzen` : `[${labels.steal}] Klauen`);
  }
  return lines;
}

/** Hinweis nach einer Polizeikontrolle. */
export function seizeText(count: number): string {
  return count === 1 ? '1 Flasche beschlagnahmt!' : `${count} Flaschen beschlagnahmt!`;
}

/** Warnungen im HUD, höchstens drei Zeilen. `notices` (kurze Hinweise wie die Beschlagnahme) stehen zuerst. */
export function alertText(state: GameState, p: Player, notices: string[] = []): string {
  if (state.phase === 'ended') return '';
  const lines: string[] = [...notices];
  if (p.unconsciousMs > 0) lines.push(`Bewusstlos! Noch ${Math.ceil(p.unconsciousMs / 1000)} s`);
  if (isBeingChecked(state, p.id)) lines.push('KONTROLLE! Lauf weg!');
  if (p.shieldMs > 0) lines.push(`Schutz ${Math.ceil(p.shieldMs / 1000)} s`);
  for (const z of state.zones) {
    const secs = Math.ceil(z.timerMs / 1000);
    if (z.phase === 'announced') lines.push(`${z.def.name} in ${secs} s!`);
    else if (z.phase === 'active') lines.push(`${z.def.name}: mehr Pfand! Noch ${secs} s`);
  }
  return lines.slice(0, 3).join('\n');
}

export function resultLines(
  state: GameState,
  labels: KeyLabels,
  nameOf: (id: string) => string = playerName,
): string[] {
  const places = ranking(state).map(
    (r, i) => `${i + 1}. ${nameOf(r.id)}  ${formatMoney(r.round)}`,
  );
  return ['Runde vorbei!', ...places, '', `Neue Runde: R oder ${labels.action}`];
}

export interface ResultRow {
  place: number;
  id: string;
  name: string;
  /** Rundenverdienst (Cent) */
  round: number;
  /** Gesamtverdienst der Serie (Cent) */
  total: number;
  isWinner: boolean;
  isViewer: boolean;
}

const MAX_NAME_LENGTH = 16;

/** Ergebniszeilen in Ranglistenreihenfolge; gleicher Rundenverdienst teilt sich den Platz (1, 1, 3). */
export function resultRows(
  state: GameState,
  viewerId: string,
  nameOf: (id: string) => string = playerName,
): ResultRow[] {
  const rows: ResultRow[] = [];
  ranking(state).forEach((r, i) => {
    const place = i > 0 && rows[i - 1].round === r.round ? rows[i - 1].place : i + 1;
    rows.push({
      place,
      id: r.id,
      name: nameOf(r.id).slice(0, MAX_NAME_LENGTH),
      round: r.round,
      total: r.total,
      isWinner: place === 1,
      isViewer: r.id === viewerId,
    });
  });
  return rows;
}

export function resultFooter(role: 'local' | 'host' | 'guest', labels: KeyLabels): string[] {
  const first = role === 'local' ? `Neue Runde: R oder ${labels.action}` : `Bereit für die nächste Runde: R oder ${labels.action}`;
  return [first, 'Menü: Esc'];
}
