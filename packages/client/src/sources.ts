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

/** Beschriftung der Tasten für vorige und nächste Shop-Kategorie. */
export interface TabLabels {
  prev: string;
  next: string;
}

/** Gamepad: Schultertasten wechseln die Shop-Kategorie. */
export const PAD_TAB_LABELS: TabLabels = { prev: 'LB', next: 'RB' };

/** Tastatur: Ausrauben-Taste = vorige, Schlagen-Taste = nächste Shop-Kategorie (Q/F bzw. / und .). */
export function keyboardTabLabels(labels: KeyLabels): TabLabels {
  return { prev: labels.steal, next: labels.attack };
}

/** Ein Gerät, das einem Spieler gehört. Phaser-Anbindung steht in devices.ts. */
export interface InputSource {
  readonly label: string;
  readonly labels: KeyLabels;
  readonly tabLabels: TabLabels;
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

/**
 * A = Aktion, B = Ausrauben, X = Schlagen, Y = Pfefferspray. Stick und Steuerkreuz laufen.
 * Schultertasten (LB/RB) wechseln nur im Shop die Kategorie.
 */
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
    tabPrev: s.l1,
    tabNext: s.r1,
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

/**
 * Sperrt die Tasten, die beim Anlegen schon gedrückt sind, bis sie einmal losgelassen wurden. Für den
 * Gerätewechsel mitten im Spiel: Tasten, die beim Wechsel gehalten werden (etwa die Bestätigung im
 * Esc-Menü), wirken nicht sofort als Spieleingabe.
 */
export class ReleaseGate {
  private readonly blocked = new Set<keyof KeyState>();

  constructor(initial: KeyState) {
    for (const key of Object.keys(initial) as (keyof KeyState)[]) if (initial[key]) this.blocked.add(key);
  }

  /** Eingabe ohne die noch gesperrten Tasten; eine losgelassene Taste ist ab dann frei. */
  filter(k: KeyState): KeyState {
    const out = { ...k };
    for (const key of [...this.blocked]) {
      if (k[key]) out[key] = false;
      else this.blocked.delete(key);
    }
    return out;
  }

  blocks(key: keyof KeyState): boolean {
    return this.blocked.has(key);
  }
}

/** Quelle, deren beim Anlegen gehaltene Tasten erst nach dem Loslassen zählen (siehe ReleaseGate). */
export function guardHeld(source: InputSource): InputSource {
  const gate = new ReleaseGate(source.read());
  return {
    label: source.label,
    labels: source.labels,
    tabLabels: source.tabLabels,
    read: () => gate.filter(source.read()),
    confirmPressed: () => source.confirmPressed() && !gate.blocks('action'),
  };
}
