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
    buy: k.buyUpgrade ? 'upgrade' : k.buyItem ? 'bolt_cutters' : null,
  };
}
