import type { Input } from '@pfandraiders/core';

/** Tastenzustand eines Geräts in einem Frame. Alles gehalten; Flanken (Ausrauben, Schlagen) erkennt der Kern. */
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
}

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
  };
}
