import {
  bottlesValue,
  capacityOf,
  CONFIG,
  containerOf,
  findAttackTarget,
  findLootTarget,
  findSearchableSpot,
  isBeingChecked,
  isNear,
  ranking,
  totalBottles,
} from '@pfandraiders/core';
import type { GameState, Player } from '@pfandraiders/core';
import { countdownLeft } from './countdown';
import type { KeyLabels } from './sources';
import { formatMoney, formatTime } from './format';

export function playerName(id: string): string {
  return id.toUpperCase();
}

/** Inventar als kurze Teile, nur was vorhanden ist. */
function inventoryParts(p: Player): string[] {
  const parts: string[] = [];
  if (p.inventory.food > 0) parts.push(`Essen ${p.inventory.food}`);
  if (p.inventory.dog_treat > 0) parts.push(`Leckerli ${p.inventory.dog_treat}`);
  if (p.inventory.bolt_cutters) parts.push('Bolzenschneider');
  return parts;
}

export function statusLines(state: GameState, p: Player): string[] {
  const lines = [
    `Zeit ${formatTime(state.timeLeftMs)}   Geld ${formatMoney(p.money)}`,
    `${containerOf(p).name} ${totalBottles(p.bottles)}/${capacityOf(p)}` +
      `   Pl${p.bottles.plastic} Gl${p.bottles.glass} Ka${p.bottles.crate}`,
  ];
  lines.push([`Leben ${Math.ceil(p.health)}/${CONFIG.health.max}`, ...inventoryParts(p)].join('   '));
  return lines;
}

export function hintLines(state: GameState, p: Player, labels: KeyLabels): string[] {
  // Vor dem Start (Countdown) geht nichts davon: keine Hinweise
  if (state.phase === 'ended' || p.unconsciousMs > 0 || countdownLeft(state) > 0) return [];
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
  if (!full && findLootTarget(state, p)) lines.push(`[${labels.steal}] Ausrauben`);
  if (p.attackCooldownMs === 0 && findAttackTarget(state, p)) lines.push(`[${labels.attack}] Schlagen`);
  const food = p.inventory.food;
  if (food > 0 && p.health <= CONFIG.health.max - CONFIG.health.food.heal) {
    lines.push(`[${labels.eat}] Essen (+${CONFIG.health.food.heal} Leben, noch ${food})`);
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
  if (p.unconsciousMs > 0) {
    lines.push(`Bewusstlos! Noch ${Math.ceil(p.unconsciousMs / 1000)} s${p.robbed ? ' (ausgeraubt)' : ''}`);
  }
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
  return ['Runde vorbei!', ...places, '', `Weiter zum Shop: R oder ${labels.action}`];
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

/** Kopfzeile des Ergebnisfelds (Spalten wie in hud.ts). */
export function resultHeader(): string {
  return 'Platz  Name              Runde     Gesamt';
}

/** Fußzeile am Rundenende: in der Serie geht es für alle in den Shop, nach der letzten Runde zur Endwertung. */
export function resultFooter(_role: 'local' | 'host' | 'guest', labels: KeyLabels, final = false): string[] {
  const next = final ? 'Weiter zur Endwertung' : 'Weiter zum Shop';
  return [`${next}: R oder ${labels.action}`, 'Menü: Esc'];
}
