import type { KeyState } from './input';

/** Beschriftung der Tasten eines Geräts für Hinweistexte. */
export interface KeyLabels {
  action: string;
  upgrade: string;
  item: string;
}

/** Ein Gerät, das einem Spieler gehört. Phaser-Anbindung steht in devices.ts. */
export interface InputSource {
  readonly label: string;
  readonly labels: KeyLabels;
  /** Eingabe dieses Frames. Kauftasten sind nur im Frame des neuen Drückens true. */
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
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/** Gehaltene Zustände, noch ohne Flankenerkennung. */
export interface HeldKeys {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
  buyUpgrade: boolean;
  buyItem: boolean;
}

/** Sticks unterhalb dieses Betrags zählen als in Ruhe. */
export const STICK_DEADZONE = 0.4;

/** A = Aktion, X = Container-Upgrade, Y = Bolzenschneider. Stick und Steuerkreuz laufen. */
export function padToHeld(s: PadSnapshot): HeldKeys {
  return {
    left: s.left || s.stickX < -STICK_DEADZONE,
    right: s.right || s.stickX > STICK_DEADZONE,
    up: s.up || s.stickY < -STICK_DEADZONE,
    down: s.down || s.stickY > STICK_DEADZONE,
    action: s.a,
    buyUpgrade: s.x,
    buyItem: s.y,
  };
}

/** Macht aus gehaltenen Kauftasten Einzeldrücke. */
export class EdgeTracker {
  private prevUpgrade = false;
  private prevItem = false;

  apply(h: HeldKeys): KeyState {
    const k: KeyState = {
      left: h.left,
      right: h.right,
      up: h.up,
      down: h.down,
      action: h.action,
      buyUpgrade: h.buyUpgrade && !this.prevUpgrade,
      buyItem: h.buyItem && !this.prevItem,
    };
    this.prevUpgrade = h.buyUpgrade;
    this.prevItem = h.buyItem;
    return k;
  }
}
