import Phaser from 'phaser';
import type { KeyState } from './input';
import { EdgeTracker, padToHeld } from './sources';
import type { InputSource, KeyLabels } from './sources';

export interface KeyboardLayout {
  name: string;
  left: string;
  right: string;
  up: string;
  down: string;
  action: string;
  steal: string;
  buyUpgrade: string;
  buyItem: string;
  labels: KeyLabels;
}

/** Phaser-Tastennamen. Zwei Spieler teilen sich eine Tastatur. */
export const KEYBOARD_LAYOUTS: KeyboardLayout[] = [
  {
    name: 'Tastatur 1 (WASD, E)',
    left: 'A',
    right: 'D',
    up: 'W',
    down: 'S',
    action: 'E',
    steal: 'Q',
    buyUpgrade: 'ONE',
    buyItem: 'TWO',
    labels: { action: 'E', upgrade: '1', item: '2', steal: 'Q' },
  },
  {
    name: 'Tastatur 2 (Pfeile, Enter)',
    left: 'LEFT',
    right: 'RIGHT',
    up: 'UP',
    down: 'DOWN',
    action: 'ENTER',
    steal: 'FORWARD_SLASH',
    buyUpgrade: 'COMMA',
    buyItem: 'PERIOD',
    labels: { action: 'Enter', upgrade: ',', item: '.', steal: '/' },
  },
];

export type DeviceRef =
  | { kind: 'keyboard'; layout: number }
  | { kind: 'pad'; index: number };

export interface PlayerSlot {
  id: string;
  color: number;
  device: DeviceRef;
}

export const PLAYER_COLORS = [0xef5350, 0xab47bc, 0x26c6da, 0xec407a];

type Key = Phaser.Input.Keyboard.Key;

class KeyboardSource implements InputSource {
  readonly label: string;
  readonly labels: KeyLabels;
  private readonly keys: Record<string, Key>;

  constructor(
    keyboard: Phaser.Input.Keyboard.KeyboardPlugin,
    private readonly layout: KeyboardLayout,
  ) {
    this.label = layout.name;
    this.labels = layout.labels;
    const names = [
      layout.left,
      layout.right,
      layout.up,
      layout.down,
      layout.action,
      layout.steal,
      layout.buyUpgrade,
      layout.buyItem,
    ];
    this.keys = keyboard.addKeys(names.join(',')) as Record<string, Key>;
  }

  read(): KeyState {
    const l = this.layout;
    const k = this.keys;
    return {
      left: k[l.left].isDown,
      right: k[l.right].isDown,
      up: k[l.up].isDown,
      down: k[l.down].isDown,
      action: k[l.action].isDown,
      steal: k[l.steal].isDown,
      buyUpgrade: Phaser.Input.Keyboard.JustDown(k[l.buyUpgrade]),
      buyItem: Phaser.Input.Keyboard.JustDown(k[l.buyItem]),
    };
  }

  confirmPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys[this.layout.action]);
  }
}

type Pad = Phaser.Input.Gamepad.Gamepad;

class GamepadSource implements InputSource {
  readonly label: string;
  readonly labels: KeyLabels = { action: 'A', upgrade: 'X', item: 'Y', steal: 'B' };
  private readonly edges = new EdgeTracker();
  private prevA = false;

  constructor(
    private readonly getPad: () => Pad | undefined,
    index: number,
  ) {
    this.label = `Gamepad ${index + 1}`;
  }

  read(): KeyState {
    const pad = this.getPad();
    // Abgezogenes Gamepad: Phaser behält das alte Objekt mit eingefrorenen Werten in gamepads[index],
    // daher zählt es nur mit connected. Spieler steht still, das Spiel läuft weiter.
    if (!pad || !pad.connected) return this.edges.apply(padToHeld(IDLE_PAD));
    return this.edges.apply(
      padToHeld({
        stickX: pad.leftStick.x,
        stickY: pad.leftStick.y,
        a: pad.A,
        x: pad.X,
        y: pad.Y,
        b: pad.B,
        left: pad.left,
        right: pad.right,
        up: pad.up,
        down: pad.down,
      }),
    );
  }

  confirmPressed(): boolean {
    const pad = this.getPad();
    const a = pad !== undefined && pad.connected && pad.A;
    const pressed = a && !this.prevA;
    this.prevA = a;
    return pressed;
  }
}

const IDLE_PAD = {
  stickX: 0,
  stickY: 0,
  a: false,
  x: false,
  y: false,
  b: false,
  left: false,
  right: false,
  up: false,
  down: false,
};

/** Baut die Eingabequelle für ein Gerät. Muss in der Szene aufgerufen werden, die sie nutzt. */
export function createSource(scene: Phaser.Scene, ref: DeviceRef): InputSource {
  if (ref.kind === 'keyboard') {
    return new KeyboardSource(scene.input.keyboard!, KEYBOARD_LAYOUTS[ref.layout]);
  }
  return new GamepadSource(() => scene.input.gamepad?.getPad(ref.index), ref.index);
}
