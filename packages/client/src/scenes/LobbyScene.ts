import Phaser from 'phaser';
import { KEYBOARD_LAYOUTS, PLAYER_COLORS } from '../devices';
import type { DeviceRef, PlayerSlot } from '../devices';
import { GAME_H, GAME_W } from '../layout';

const FONT = { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' };
const MAX_PLAYERS = 4;
const PAD_START_BUTTON = 9;

function sameDevice(a: DeviceRef, b: DeviceRef): boolean {
  if (a.kind === 'keyboard' && b.kind === 'keyboard') return a.layout === b.layout;
  if (a.kind === 'pad' && b.kind === 'pad') return a.index === b.index;
  return false;
}

function describe(ref: DeviceRef): string {
  return ref.kind === 'keyboard' ? KEYBOARD_LAYOUTS[ref.layout].name : `Gamepad ${ref.index + 1}`;
}

export class LobbyScene extends Phaser.Scene {
  private slots: PlayerSlot[] = [];
  private text!: Phaser.GameObjects.Text;
  private joinKeys: Phaser.Input.Keyboard.Key[] = [];
  private startKey!: Phaser.Input.Keyboard.Key;
  private padPrev: Record<number, { a: boolean; b: boolean; start: boolean }> = {};
  private backKey!: Phaser.Input.Keyboard.Key;
  private notice = '';

  constructor() {
    super('lobby');
  }

  init(data?: { notice?: string }): void {
    this.notice = data?.notice ?? '';
  }

  create(): void {
    this.slots = [];
    this.padPrev = {};
    const params = new URLSearchParams(window.location.search);

    // Testhilfen: ?solo=1 startet sofort mit Tastatur 1, ?players=N startet N Spieler ohne Lobby.
    const debugCount = params.has('solo') ? 1 : Number(params.get('players'));
    if (debugCount >= 1 && debugCount <= MAX_PLAYERS) {
      const slots: PlayerSlot[] = Array.from({ length: debugCount }, (_, i) => ({
        id: `p${i + 1}`,
        color: PLAYER_COLORS[i],
        device: { kind: 'keyboard', layout: i % KEYBOARD_LAYOUTS.length },
      }));
      this.scene.start('game', { slots });
      return;
    }

    this.joinKeys = KEYBOARD_LAYOUTS.map((l) => this.input.keyboard!.addKey(l.action));
    this.startKey = this.input.keyboard!.addKey('SPACE');
    this.backKey = this.input.keyboard!.addKey('ESC');
    this.text = this.add.text(GAME_W / 2, GAME_H / 2, '', { ...FONT, align: 'center' }).setOrigin(0.5);
  }

  update(): void {
    if (!this.text) return; // Testhilfe-Pfad: create() hat schon zur Spielszene gewechselt
    if (Phaser.Input.Keyboard.JustDown(this.backKey)) {
      this.scene.start('menu');
      return;
    }
    KEYBOARD_LAYOUTS.forEach((_, layout) => {
      if (Phaser.Input.Keyboard.JustDown(this.joinKeys[layout])) {
        this.join({ kind: 'keyboard', layout });
      }
    });

    let backPressed = false;
    let startPressed = Phaser.Input.Keyboard.JustDown(this.startKey);
    for (const pad of this.input.gamepad?.gamepads ?? []) {
      if (!pad || !pad.connected) continue; // abgezogene Pads bleiben in gamepads stehen
      // Erster Blick: aus der Vorszene gehaltenes B zählt nicht als Druck
      const prev = this.padPrev[pad.index] ?? { a: false, b: pad.B, start: false };
      if (pad.B && !prev.b) backPressed = true;
      const start = pad.buttons[PAD_START_BUTTON]?.pressed ?? false;
      if (pad.A && !prev.a) this.join({ kind: 'pad', index: pad.index });
      if (start && !prev.start && this.slots.length > 0) startPressed = true;
      this.padPrev[pad.index] = { a: pad.A, b: pad.B, start };
    }

    if (backPressed) {
      this.scene.start('menu');
      return;
    }
    if (startPressed && this.slots.length > 0) {
      this.scene.start('game', { slots: this.slots });
      return;
    }
    this.text.setText(this.lines().join('\n'));
  }

  private join(device: DeviceRef): void {
    if (this.slots.length >= MAX_PLAYERS) return;
    if (this.slots.some((s) => sameDevice(s.device, device))) return;
    const n = this.slots.length;
    this.slots.push({ id: `p${n + 1}`, color: PLAYER_COLORS[n], device });
  }

  private lines(): string[] {
    const lines = ['PfandRaiders', '', 'Beitreten: Tastatur 1 = E, Tastatur 2 = Enter, Gamepad = A', ''];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const slot = this.slots[i];
      lines.push(slot ? `P${i + 1}: ${describe(slot.device)}` : `P${i + 1}: (frei)`);
    }
    lines.push('', 'Zurück: Esc oder Gamepad B');
    lines.push('', this.slots.length > 0 ? 'Start: Leertaste oder Start-Taste' : 'Mindestens ein Spieler muss beitreten');
    if (this.notice) lines.push('', this.notice);
    return lines;
  }
}
