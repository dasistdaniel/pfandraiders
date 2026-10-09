import type { DeviceRef } from './devices';
import type { KeyState } from './input';

/** Beschriftung der Tasten eines Geräts für Hinweistexte. */
export interface KeyLabels {
  action: string;
  steal: string;
  attack: string;
  spray: string;
}

/** Beschriftung der Gamepad-Tasten, passend zu padToHeld. */
export const PAD_LABELS: KeyLabels = { action: 'A', steal: 'B', attack: 'X', spray: 'Y' };

/** Ein Gerät, das einem Spieler gehört. Phaser-Anbindung steht in devices.ts. */
export interface InputSource {
  readonly label: string;
  readonly labels: KeyLabels;
  /** Eingabe dieses Frames (alles gehalten). */
  read(): KeyState;
  /** Wurde die Bestätigungstaste in diesem Frame neu gedrückt (Neustart nach Rundenende)? */
  confirmPressed(): boolean;
}

export interface PadSnapshot {
  stickX: number;
  stickY: number;
  a: boolean;
  x: boolean;
  y: boolean;
  b: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  l1: boolean;
  r1: boolean;
}

/** Sticks unterhalb dieses Betrags zählen als in Ruhe. */
export const STICK_DEADZONE = 0.4;

/** A = Aktion, B = Ausrauben, X = Schlagen, Y = Pfefferspray. Stick und Steuerkreuz laufen. Schultertasten sind frei. */
export function padToHeld(s: PadSnapshot): KeyState {
  return {
    left: s.left || s.stickX < -STICK_DEADZONE,
    right: s.right || s.stickX > STICK_DEADZONE,
    up: s.up || s.stickY < -STICK_DEADZONE,
    down: s.down || s.stickY > STICK_DEADZONE,
    action: s.a,
    steal: s.b,
    attack: s.x,
    spray: s.y,
  };
}

/**
 * Zählt ein neu gedrücktes Gamepad-B (`pressed`: Indizes der Pads mit neuem B-Druck) als "zurück ins Menü"?
 * Lokal jedes Pad. Online nur das gewählte Gerät, damit ein fremdes oder liegendes Pad nicht versehentlich hinauswirft.
 */
export function padBLeaves(online: boolean, device: DeviceRef | undefined, pressed: ReadonlySet<number>): boolean {
  if (!online) return pressed.size > 0;
  return device?.kind === 'pad' && pressed.has(device.index);
}

/**
 * Kam ein Tastendruck aus der automatischen Wiederholung des Betriebssystems? Phaser legt Tasten je Szene
 * neu an; eine aus der vorigen Szene gehaltene Taste meldet sich in der neuen Szene erst mit einer
 * Wiederholung und sähe sonst wie ein neuer Druck aus (etwa Kaufen direkt nach der Rangliste).
 */
export function isHeldOver(event: { repeat?: unknown } | null | undefined): boolean {
  return event?.repeat === true;
}
