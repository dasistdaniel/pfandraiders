import type { Input } from '@pfandraiders/core';

export interface KeyState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
  /** Klauen-Taste gehalten */
  steal: boolean;
  /** true nur im Frame, in dem die Taste neu gedrückt wurde */
  buyUpgrade: boolean;
  /** true nur im Frame, in dem die Taste neu gedrückt wurde */
  buyItem: boolean;
  /** true nur im Frame, in dem die Taste neu gedrückt wurde */
  buyTreat: boolean;
  /** true nur im Frame, in dem die Taste neu gedrückt wurde */
  buyFood: boolean;
}

function axis(negative: boolean, positive: boolean): -1 | 0 | 1 {
  return ((positive ? 1 : 0) - (negative ? 1 : 0)) as -1 | 0 | 1;
}

/** Die früheren Kauftasten (buy*) wirken nicht mehr; Schlagen und Essen bekommen in Plan 2 eigene Tasten. */
export function buildInput(k: KeyState): Input {
  return {
    moveX: axis(k.left, k.right),
    moveY: axis(k.up, k.down),
    action: k.action,
    steal: k.steal,
    attack: false,
    eat: false,
  };
}
