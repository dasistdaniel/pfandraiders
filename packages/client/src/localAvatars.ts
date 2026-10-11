import { isAvatar, pickAvatar } from '@pfandraiders/core';
import { stepAvatar } from './avatarGrid';

/**
 * Figurenwahl in der lokalen Lobby. Jede der 24 Figuren (Index in ALL_CHARACTERS, wie online) gibt es unter den
 * lokalen Spielern nur einmal. Bewusst ohne Phaser, damit es testbar bleibt.
 */

/** Gerät eines Slots (gleiche Form wie DeviceRef in devices.ts, ohne dessen Phaser-Abhängigkeit) */
type Device = { kind: 'keyboard'; layout: number } | { kind: 'pad'; index: number };

/** Figuren der Slots, ohne den Slot `except`; Slots ohne gültige Figur zählen nicht. */
export function takenBySlots(slots: readonly { avatar?: number }[], except?: number): Set<number> {
  const taken = new Set<number>();
  slots.forEach((s, i) => {
    if (i !== except && isAvatar(s.avatar)) taken.add(s.avatar);
  });
  return taken;
}

/** Figur für einen neuen Spieler: der Wunsch, wenn frei, sonst die erste freie der festen Reihenfolge (wie online). */
export function joinAvatar(slots: readonly { avatar?: number }[], wish?: number): number {
  return pickAvatar(takenBySlots(slots), wish);
}

/**
 * Nächste freie Figur für Slot `index` nach links (-1) oder rechts (1), mit Umlauf; Figuren der anderen lokalen
 * Spieler werden übersprungen. undefined, wenn der Slot fehlt oder keine gültige Figur hat.
 */
export function stepSlotAvatar(slots: readonly { avatar?: number }[], index: number, dir: -1 | 1): number | undefined {
  const current = slots[index]?.avatar;
  if (!isAvatar(current)) return undefined;
  return stepAvatar(current, dir < 0 ? 'ArrowLeft' : 'ArrowRight', takenBySlots(slots, index));
}

/** Kurzer Gerätename für die Felder der Lobby: "Tastatur 1", "Gamepad 2". */
export function deviceShort(ref: Device): string {
  return ref.kind === 'keyboard' ? `Tastatur ${ref.layout + 1}` : `Gamepad ${ref.index + 1}`;
}

/** Tasten, mit denen dieses Gerät die Figur wechselt. */
export function figureKeysHint(ref: Device): string {
  if (ref.kind === 'pad') return 'Stick / Kreuz';
  return ref.layout === 0 ? 'A / D' : '← / →';
}
