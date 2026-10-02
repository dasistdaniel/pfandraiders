import {
  bottlesValue,
  capacityOf,
  CONFIG,
  containerOf,
  findSearchableSpot,
  findStealTarget,
  isBeingRobbed,
  isNear,
  nextUpgrade,
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
  if (p.item !== null) lines.push(`Item: ${CONFIG.items[p.item].name}`);
  return lines;
}

export function hintLines(state: GameState, p: Player, labels: KeyLabels): string[] {
  if (state.phase === 'ended') return [];
  const lines: string[] = [];

  if (isNear(state.map.shops, p)) {
    const up = nextUpgrade(p);
    lines.push(up ? `[${labels.upgrade}] ${up.name} (${up.capacity} Plätze) ${formatMoney(up.price)}` : 'Voll ausgebaut');
    lines.push(
      p.item === null
        ? `[${labels.item}] ${CONFIG.items.bolt_cutters.name} ${formatMoney(CONFIG.items.bolt_cutters.price)}`
        : 'Item-Slot belegt',
    );
  } else if (isNear(state.map.dropoffs, p)) {
    lines.push(
      totalBottles(p.bottles) > 0
        ? `[${labels.action}] Pfand abgeben ${formatMoney(bottlesValue(p.bottles))}`
        : 'Pfandautomat: nichts zum Abgeben',
    );
  }

  const full = totalBottles(p.bottles) >= capacityOf(p);
  if (findSearchableSpot(state, p)) {
    lines.push(full ? 'Container voll' : `[${labels.action} halten] Suchen`);
  }
  if (p.mode !== 'searching' && !full && findStealTarget(state, p)) {
    lines.push(p.item !== null ? `[${labels.action}] Bolzenschneider einsetzen` : `[${labels.action} halten] Klauen`);
  }
  return lines;
}

export function alertText(state: GameState, p: Player): string {
  if (isBeingRobbed(state, p.id)) return '! DU WIRST BESTOHLEN !';
  if (p.shieldMs > 0) return `Bestohlen! Schutz ${Math.ceil(p.shieldMs / 1000)} s`;
  return '';
}

export function resultLines(state: GameState, labels: KeyLabels): string[] {
  const places = ranking(state).map(
    (r, i) => `${i + 1}. ${playerName(r.id)}  ${formatMoney(r.money)}`,
  );
  return ['Runde vorbei!', ...places, '', `Neue Runde: R oder ${labels.action}`];
}
