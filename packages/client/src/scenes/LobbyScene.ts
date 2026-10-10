import Phaser from 'phaser';
import { DEFAULT_MAP_ID, stepMapId } from '@pfandraiders/core';
import type { MapId } from '@pfandraiders/core';
import { KEYBOARD_LAYOUTS, PLAYER_COLORS } from '../devices';
import type { DeviceRef, PlayerSlot } from '../devices';
import { GAME_W } from '../layout';
import { addLogo } from '../logoTexture';
import { mapLine } from '../mapChoice';
import { roundMsLabel, stepRoundMs } from '../roundTime';
import { loadLocalMapId, loadLocalRoundMs, saveLocalMapId, saveLocalRoundMs } from '../settings';
import { sfx } from '../sfx';

const FONT = { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' };
/** Oberkante des Lobby-Textes unter dem Logo. */
const TEXT_TOP = 232;
const MAX_PLAYERS = 4;
const PAD_START_BUTTON = 9;

interface PadPrev {
  a: boolean;
  b: boolean;
  start: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

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
  private padPrev: Record<number, PadPrev> = {};
  private roundMs = 300_000;
  private roundKeys: { left: Phaser.Input.Keyboard.Key[]; right: Phaser.Input.Keyboard.Key[] } = { left: [], right: [] };
  /** Karte der Serie; hoch/runter wechselt sie (links/rechts gehört der Rundenzeit) */
  private mapId: MapId = DEFAULT_MAP_ID;
  private mapKeys: { up: Phaser.Input.Keyboard.Key[]; down: Phaser.Input.Keyboard.Key[] } = { up: [], down: [] };
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
    this.roundMs = loadLocalRoundMs();
    this.mapId = loadLocalMapId();
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
      this.scene.start('game', { slots, roundMs: this.roundMs, mapId: this.mapId });
      return;
    }

    this.joinKeys = KEYBOARD_LAYOUTS.map((l) => this.input.keyboard!.addKey(l.action));
    this.startKey = this.input.keyboard!.addKey('SPACE');
    this.backKey = this.input.keyboard!.addKey('ESC');
    const kb = this.input.keyboard!;
    this.roundKeys = { left: [kb.addKey('A'), kb.addKey('LEFT')], right: [kb.addKey('D'), kb.addKey('RIGHT')] };
    this.mapKeys = { up: [kb.addKey('W'), kb.addKey('UP')], down: [kb.addKey('S'), kb.addKey('DOWN')] };
    addLogo(this, 32); // oben mittig, bis y 216
    this.text = this.add.text(GAME_W / 2, TEXT_TOP, '', { ...FONT, align: 'center' }).setOrigin(0.5, 0);
  }

  update(): void {
    if (!this.text) return; // Testhilfe-Pfad: create() hat schon zur Spielszene gewechselt
    if (Phaser.Input.Keyboard.JustDown(this.backKey)) {
      sfx.play('ui_back');
      this.scene.start('menu');
      return;
    }
    KEYBOARD_LAYOUTS.forEach((_, layout) => {
      if (Phaser.Input.Keyboard.JustDown(this.joinKeys[layout])) {
        this.join({ kind: 'keyboard', layout });
      }
    });

    let roundDir: -1 | 0 | 1 = 0;
    if (this.roundKeys.left.some((k) => Phaser.Input.Keyboard.JustDown(k))) roundDir = -1;
    if (this.roundKeys.right.some((k) => Phaser.Input.Keyboard.JustDown(k))) roundDir = 1;
    let mapDir: -1 | 0 | 1 = 0;
    if (this.mapKeys.up.some((k) => Phaser.Input.Keyboard.JustDown(k))) mapDir = -1;
    if (this.mapKeys.down.some((k) => Phaser.Input.Keyboard.JustDown(k))) mapDir = 1;
    let backPressed = false;
    let startPressed = Phaser.Input.Keyboard.JustDown(this.startKey);
    for (const pad of this.input.gamepad?.gamepads ?? []) {
      if (!pad || !pad.connected) continue; // abgezogene Pads bleiben in gamepads stehen
      const left = pad.left || pad.leftStick.x < -0.5;
      const right = pad.right || pad.leftStick.x > 0.5;
      const up = pad.up || pad.leftStick.y < -0.5;
      const down = pad.down || pad.leftStick.y > 0.5;
      // Erster Blick: aus der Vorszene gehaltene Tasten zählen nicht als Druck
      const prev = this.padPrev[pad.index] ?? { a: pad.A, b: pad.B, start: false, left, right, up, down };
      if (left && !prev.left) roundDir = -1;
      if (right && !prev.right) roundDir = 1;
      if (up && !prev.up) mapDir = -1;
      if (down && !prev.down) mapDir = 1;
      if (pad.B && !prev.b) backPressed = true;
      const start = pad.buttons[PAD_START_BUTTON]?.pressed ?? false;
      if (pad.A && !prev.a) this.join({ kind: 'pad', index: pad.index });
      if (start && !prev.start && this.slots.length > 0) startPressed = true;
      this.padPrev[pad.index] = { a: pad.A, b: pad.B, start, left, right, up, down };
    }
    if (roundDir !== 0) {
      sfx.play('ui_move');
      this.roundMs = stepRoundMs(this.roundMs, roundDir);
      saveLocalRoundMs(this.roundMs);
    }
    if (mapDir !== 0) {
      sfx.play('ui_move');
      this.mapId = stepMapId(this.mapId, mapDir);
      saveLocalMapId(this.mapId);
    }

    if (backPressed) {
      sfx.play('ui_back');
      this.scene.start('menu');
      return;
    }
    if (startPressed && this.slots.length > 0) {
      sfx.play('ui_select');
      this.scene.start('game', { slots: this.slots, roundMs: this.roundMs, mapId: this.mapId });
      return;
    }
    this.text.setText(this.lines().join('\n'));
  }

  private join(device: DeviceRef): void {
    if (this.slots.length >= MAX_PLAYERS) return;
    if (this.slots.some((s) => sameDevice(s.device, device))) return;
    const n = this.slots.length;
    this.slots.push({ id: `p${n + 1}`, color: PLAYER_COLORS[n], device });
    sfx.play('join');
  }

  private lines(): string[] {
    const lines = ['Beitreten: Tastatur 1 = E, Tastatur 2 = Enter, Gamepad = A'];
    lines.push(`Rundenzeit: ◄ ${roundMsLabel(this.roundMs)} ►  (links/rechts)`);
    lines.push(mapLine(this.mapId));
    lines.push('');
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
