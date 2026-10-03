import type { KeyState } from './input';

/** Beschriftung der Tasten eines Geräts für Hinweistexte. */
export interface KeyLabels {
  action: string;
  upgrade: string;
  item: string;
  steal: string;
  treat: string;
  food: string;
}

/** Beschriftung der Gamepad-Tasten, passend zu padToHeld. */
export const PAD_LABELS: KeyLabels = { action: 'A', upgrade: 'X', item: 'Y', steal: 'B', treat: 'RB', food: 'LB' };

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
  b: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  l1: boolean;
  r1: boolean;
}

/** Gehaltene Zustände, noch ohne Flankenerkennung. */
export interface HeldKeys {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
  steal: boolean;
  buyUpgrade: boolean;
  buyItem: boolean;
  buyTreat: boolean;
  buyFood: boolean;
}

/** Sticks unterhalb dieses Betrags zählen als in Ruhe. */
export const STICK_DEADZONE = 0.4;

/** A = Aktion, B = Klauen, X = Container-Upgrade, Y = Bolzenschneider, RB = Leckerli, LB = Futter. Stick und Steuerkreuz laufen. */
export function padToHeld(s: PadSnapshot): HeldKeys {
  return {
    left: s.left || s.stickX < -STICK_DEADZONE,
    right: s.right || s.stickX > STICK_DEADZONE,
    up: s.up || s.stickY < -STICK_DEADZONE,
    down: s.down || s.stickY > STICK_DEADZONE,
    action: s.a,
    steal: s.b,
    buyUpgrade: s.x,
    buyItem: s.y,
    buyTreat: s.r1,
    buyFood: s.l1,
  };
}

/** Macht aus gehaltenen Kauftasten Einzeldrücke. */
export class EdgeTracker {
  private prevUpgrade = false;
  private prevItem = false;
  private prevTreat = false;
  private prevFood = false;

  apply(h: HeldKeys): KeyState {
    const k: KeyState = {
      left: h.left,
      right: h.right,
      up: h.up,
      down: h.down,
      action: h.action,
      steal: h.steal,
      buyUpgrade: h.buyUpgrade && !this.prevUpgrade,
      buyItem: h.buyItem && !this.prevItem,
      buyTreat: h.buyTreat && !this.prevTreat,
      buyFood: h.buyFood && !this.prevFood,
    };
    this.prevUpgrade = h.buyUpgrade;
    this.prevItem = h.buyItem;
    this.prevTreat = h.buyTreat;
    this.prevFood = h.buyFood;
    return k;
  }
}
