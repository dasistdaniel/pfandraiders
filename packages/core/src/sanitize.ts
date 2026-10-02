import { NO_INPUT } from './types';
import type { BuyCommand, Input } from './types';

export const BUY_COMMANDS: readonly BuyCommand[] = ['upgrade', 'food', 'bolt_cutters', 'dog_treat'];

function axis(v: unknown): -1 | 0 | 1 {
  return v === -1 || v === 1 ? v : 0;
}

/** Macht aus beliebigen Daten (zum Beispiel aus dem Netz) eine gültige Eingabe. Alles Ungültige wird zu "keine Eingabe". */
export function sanitizeInput(raw: unknown): Input {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...NO_INPUT };
  const r = raw as Record<string, unknown>;
  const buy =
    typeof r.buy === 'string' && (BUY_COMMANDS as readonly string[]).includes(r.buy)
      ? (r.buy as BuyCommand)
      : null;
  return {
    moveX: axis(r.moveX),
    moveY: axis(r.moveY),
    action: r.action === true,
    steal: r.steal === true,
    buy,
  };
}
