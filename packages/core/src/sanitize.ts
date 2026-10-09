import { NO_INPUT } from './types';
import type { Input } from './types';

function axis(v: unknown): -1 | 0 | 1 {
  return v === -1 || v === 1 ? v : 0;
}

/** Macht aus beliebigen Daten (zum Beispiel aus dem Netz) eine gültige Eingabe. Alles Ungültige wird zu "keine Eingabe". */
export function sanitizeInput(raw: unknown): Input {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...NO_INPUT };
  const r = raw as Record<string, unknown>;
  return {
    moveX: axis(r.moveX),
    moveY: axis(r.moveY),
    action: r.action === true,
    steal: r.steal === true,
    attack: r.attack === true,
    spray: r.spray === true,
  };
}
