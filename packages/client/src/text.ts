import {
  bottlesValue,
  capacityOf,
  CONFIG,
  containerOf,
  findSearchableSpot,
  findStealTarget,
  isBeingChecked,
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
  const health = `Leben ${Math.ceil(p.health)}/${CONFIG.health.max}`;
  lines.push(p.item !== null ? `${health}   Item: ${CONFIG.items[p.item].name}` : health);
  return lines;
}

export function hintLines(state: GameState, p: Player, labels: KeyLabels): string[] {
  if (state.phase === 'ended' || p.unconsciousMs > 0) return [];
  const lines: string[] = [];

  if (isNear(state.map.shops, p)) {
    const up = nextUpgrade(p);
    lines.push(up ? `[${labels.upgrade}] ${up.name} (${up.capacity} Plätze) ${formatMoney(up.price)}` : 'Voll ausgebaut');
    lines.push(
      p.item === null
        ? `[${labels.item}] ${CONFIG.items.bolt_cutters.name} ${formatMoney(CONFIG.items.bolt_cutters.price)}`
        : 'Item-Slot belegt',
    );
    if (p.item === null) {
      lines.push(`[${labels.treat}] ${CONFIG.items.dog_treat.name} ${formatMoney(CONFIG.items.dog_treat.price)}`);
    }
    lines.push(
      `[${labels.food}] Essen +${CONFIG.health.food.heal} Leben ${formatMoney(CONFIG.health.food.price)}`,
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
  if (!full && findStealTarget(state, p)) {
    lines.push(p.item !== null ? `[${labels.steal}] Bolzenschneider einsetzen` : `[${labels.steal} halten] Klauen`);
  }
  return lines;
}

export function alertText(state: GameState, p: Player): string {
  if (state.phase === 'ended') return '';
  const lines: string[] = [];
  if (p.unconsciousMs > 0) lines.push(`Bewusstlos! Noch ${Math.ceil(p.unconsciousMs / 1000)} s`);
  if (isBeingChecked(state, p.id)) lines.push('KONTROLLE! Lauf weg!');
  if (isBeingRobbed(state, p.id)) lines.push('! DU WIRST BESTOHLEN !');
  else if (p.shieldMs > 0) lines.push(`Schutz ${Math.ceil(p.shieldMs / 1000)} s`);
  for (const z of state.zones) {
    const secs = Math.ceil(z.timerMs / 1000);
    if (z.phase === 'announced') lines.push(`${z.def.name} in ${secs} s!`);
    else if (z.phase === 'active') lines.push(`${z.def.name}: mehr Pfand! Noch ${secs} s`);
  }
  return lines.slice(0, 3).join('\n');
}

export function resultLines(state: GameState, labels: KeyLabels): string[] {
  const places = ranking(state).map(
    (r, i) => `${i + 1}. ${playerName(r.id)}  ${formatMoney(r.money)}`,
  );
  return ['Runde vorbei!', ...places, '', `Neue Runde: R oder ${labels.action}`];
}
