import { VALUE_ORDER } from '@pfandraiders/core';
import type { BottleKind, Bottles } from '@pfandraiders/core';

/** Ein Platz im HUD: 8 x 10 px, 2 px Abstand, 16 je Zeile (31 Plätze = 2 Zeilen, 158 px breit). */
export const BOTTLE_ICON = { w: 8, h: 10, gap: 2, perRow: 16 };

/** Plastik blau, Glas grün, Kasten braun, freier Platz grau */
export const BOTTLE_ICON_COLORS: Record<BottleKind | 'free', number> = {
  plastic: 0x42a5f5,
  glass: 0x66bb6a,
  crate: 0x8d6e63,
  free: 0x616161,
};

export interface BottleIcon {
  /** linke obere Ecke relativ zum ersten Platz */
  x: number;
  y: number;
  /** null = freier Platz */
  kind: BottleKind | null;
}

/**
 * Plätze des eigenen Containers als Symbole: belegte zuerst in Abgabe-Reihenfolge (Kasten, Glas, Plastik),
 * dann freie, zeilenweise zu `perRow`. Mehr Flaschen als Plätze werden nur bis zur Kapazität gezeigt. Rein, ohne Phaser.
 */
export function bottleIcons(bottles: Bottles, capacity: number, perRow = BOTTLE_ICON.perRow): BottleIcon[] {
  const kinds: (BottleKind | null)[] = [];
  for (const kind of VALUE_ORDER) for (let i = 0; i < bottles[kind]; i++) kinds.push(kind);
  const slots = Math.max(0, Math.floor(capacity));
  const row = Math.max(1, Math.floor(perRow));
  const out: BottleIcon[] = [];
  for (let i = 0; i < slots; i++) {
    out.push({
      x: (i % row) * (BOTTLE_ICON.w + BOTTLE_ICON.gap),
      y: Math.floor(i / row) * (BOTTLE_ICON.h + BOTTLE_ICON.gap),
      kind: kinds[i] ?? null,
    });
  }
  return out;
}

/** Schlüssel für das Neuzeichnen: ändert sich nur, wenn sich Inhalt oder Kapazität ändern. */
export function bottleIconsKey(bottles: Bottles, capacity: number): string {
  return `${capacity}:${bottles.crate},${bottles.glass},${bottles.plastic}`;
}
