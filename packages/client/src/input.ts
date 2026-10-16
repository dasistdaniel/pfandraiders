import type { Input } from '@pfandraiders/core';

/** Tastenzustand eines Geräts in einem Frame. Alles gehalten; Flanken (Ausrauben, Schlagen, Sprühen) erkennt der Kern. */
export interface KeyState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
  /** Ausrauben-Taste gehalten (Feldname steal) */
  steal: boolean;
  /** Schlagen-Taste gehalten */
  attack: boolean;
  /** Pfefferspray-Taste gehalten */
  spray: boolean;
  /** Shop: vorige Kategorie (Tastatur: Ausrauben-Taste, Gamepad: LB); im Spiel ohne Wirkung */
  tabPrev: boolean;
  /** Shop: nächste Kategorie (Tastatur: Schlagen-Taste, Gamepad: RB); im Spiel ohne Wirkung */
  tabNext: boolean;
  /**
   * Tastatur: Richtungen, die schon in der vorigen Szene gedrückt waren (Phaser meldet sie erst mit der
   * Tastenwiederholung). Nur Menüs wie der Shop werten das aus; im Spiel läuft man damit weiter wie bisher.
   */
  heldOver?: Partial<Record<Direction, boolean>>;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Die gehaltenen Tasten eines KeyState (ohne heldOver). */
export const KEY_FIELDS = ['left', 'right', 'up', 'down', 'action', 'steal', 'attack', 'spray', 'tabPrev', 'tabNext'] as const;
export type KeyField = (typeof KEY_FIELDS)[number];

function axis(negative: boolean, positive: boolean): -1 | 0 | 1 {
  return ((positive ? 1 : 0) - (negative ? 1 : 0)) as -1 | 0 | 1;
}

export function buildInput(k: KeyState): Input {
  return {
    moveX: axis(k.left, k.right),
    moveY: axis(k.up, k.down),
    action: k.action,
    steal: k.steal,
    attack: k.attack,
    spray: k.spray,
  };
}
