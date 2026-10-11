import Phaser from 'phaser';
import { DEFAULT_MAP_ID, stepMapId } from '@pfandraiders/core';
import type { MapId } from '@pfandraiders/core';
import { KEYBOARD_LAYOUTS, PLAYER_COLORS } from '../devices';
import type { DeviceRef, PlayerSlot } from '../devices';
import { GAME_W } from '../layout';
import { deviceShort, figureKeysHint, joinAvatar, stepSlotAvatar } from '../localAvatars';
import { addLogo } from '../logoTexture';
import { mapLine } from '../mapChoice';
import { ALL_CHARACTERS, CHAR_FRAME_H, CHAR_FRAME_W, previewFrame } from '../playerChars';
import { localRoundLine, stepRoundMs } from '../roundTime';
import { loadAvatarWish, loadLocalMapId, loadLocalRoundMs, saveAvatarWish, saveLocalMapId, saveLocalRoundMs } from '../settings';
import { sfx } from '../sfx';
import { charTexture } from '../textureKeys';

const FONT = { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' };
/** Oberkante des Lobby-Textes unter dem Logo. */
const TEXT_TOP = 232;
const MAX_PLAYERS = 4;
const PAD_START_BUTTON = 9;
/** Felder der Spieler: eine Reihe mit 4 Feldern unter dem oberen Text */
const PANEL_W = 220;
const PANEL_GAP = 12;
const PANEL_H = 124;
/** Große Figur im Feld: 4-fach (64 x 68 px) */
const FIGURE_SCALE = 4;
/** Abstand zwischen Textblöcken und Feldern */
const GAP = 10;
/** Tasten für die Rundenzeit: Minus bzw. Plus (Hauptfeld je nach Browser/Layout und Ziffernblock) */
const ROUND_DOWN_CODES = [189, 173, 109];
const ROUND_UP_CODES = [187, 171, 61, 107];

interface PadPrev {
  a: boolean;
  b: boolean;
  start: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  l1: boolean;
  r1: boolean;
}

/** Ein Spielerfeld: "P1: Gerät", darunter ◄ [große Figur] ► und die Tasten */
interface Panel {
  bg: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  frame: Phaser.GameObjects.Rectangle;
  figure: Phaser.GameObjects.Image;
  prev: Phaser.GameObjects.Text;
  next: Phaser.GameObjects.Text;
  hint: Phaser.GameObjects.Text;
}

function sameDevice(a: DeviceRef, b: DeviceRef): boolean {
  if (a.kind === 'keyboard' && b.kind === 'keyboard') return a.layout === b.layout;
  if (a.kind === 'pad' && b.kind === 'pad') return a.index === b.index;
  return false;
}

const toCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

export class LobbyScene extends Phaser.Scene {
  private slots: PlayerSlot[] = [];
  private text!: Phaser.GameObjects.Text;
  private footer!: Phaser.GameObjects.Text;
  private panels: Panel[] = [];
  private joinKeys: Phaser.Input.Keyboard.Key[] = [];
  private startKey!: Phaser.Input.Keyboard.Key;
  private padPrev: Record<number, PadPrev> = {};
  private roundMs = 300_000;
  /** Rundenzeit mit - / + (links/rechts gehört der Figurenwahl) */
  private roundKeys: { down: Phaser.Input.Keyboard.Key[]; up: Phaser.Input.Keyboard.Key[] } = { down: [], up: [] };
  /** Figurenwahl: links/rechts je Tastaturbelegung (Tastatur 1 A/D, Tastatur 2 Pfeile) */
  private figureKeys: { left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key }[] = [];
  /** Karte der Serie; hoch/runter wechselt sie */
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
    this.panels = [];
    this.roundMs = loadLocalRoundMs();
    this.mapId = loadLocalMapId();
    this.padPrev = {};
    const params = new URLSearchParams(window.location.search);

    // Testhilfen: ?solo=1 startet sofort mit Tastatur 1, ?players=N startet N Spieler ohne Lobby
    // (ohne avatar: Figuren nach Position).
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

    const kb = this.input.keyboard!;
    this.joinKeys = KEYBOARD_LAYOUTS.map((l) => kb.addKey(l.action));
    this.startKey = kb.addKey('SPACE');
    this.backKey = kb.addKey('ESC');
    this.roundKeys = { down: ROUND_DOWN_CODES.map((c) => kb.addKey(c)), up: ROUND_UP_CODES.map((c) => kb.addKey(c)) };
    this.figureKeys = KEYBOARD_LAYOUTS.map((l) => ({ left: kb.addKey(l.left), right: kb.addKey(l.right) }));
    this.mapKeys = { up: [kb.addKey('W'), kb.addKey('UP')], down: [kb.addKey('S'), kb.addKey('DOWN')] };
    addLogo(this, 32); // oben mittig, bis y 216
    this.text = this.add.text(GAME_W / 2, TEXT_TOP, '', { ...FONT, align: 'center' }).setOrigin(0.5, 0);
    this.footer = this.add.text(GAME_W / 2, 0, '', { ...FONT, align: 'center' }).setOrigin(0.5, 0);
    const left = (GAME_W - MAX_PLAYERS * PANEL_W - (MAX_PLAYERS - 1) * PANEL_GAP) / 2;
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const cx = left + i * (PANEL_W + PANEL_GAP) + PANEL_W / 2;
      const fw = CHAR_FRAME_W * FIGURE_SCALE;
      const fh = CHAR_FRAME_H * FIGURE_SCALE;
      this.panels.push({
        bg: this.add.rectangle(cx, 0, PANEL_W, PANEL_H, 0x000000, 0.35).setOrigin(0.5, 0),
        title: this.add.text(cx, 0, '', FONT).setOrigin(0.5, 0),
        frame: this.add.rectangle(cx, 0, fw + 8, fh + 6, 0x000000, 0.4).setOrigin(0.5, 0),
        figure: this.add.image(cx, 0, charTexture(ALL_CHARACTERS[0]), 0).setOrigin(0.5, 0).setScale(FIGURE_SCALE),
        prev: this.add.text(cx - fw / 2 - 24, 0, '◄', { ...FONT, fontSize: '20px' }).setOrigin(0.5, 0.5),
        next: this.add.text(cx + fw / 2 + 24, 0, '►', { ...FONT, fontSize: '20px' }).setOrigin(0.5, 0.5),
        hint: this.add.text(cx, 0, '', { ...FONT, fontSize: '13px', color: '#aaaaaa' }).setOrigin(0.5, 0),
      });
    }
  }

  update(time: number): void {
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
      // Figur wechseln nur mit dem eigenen Gerät, und erst nach dem Beitritt
      const keys = this.figureKeys[layout];
      const left = Phaser.Input.Keyboard.JustDown(keys.left);
      const right = Phaser.Input.Keyboard.JustDown(keys.right);
      if (left !== right) this.stepFigure({ kind: 'keyboard', layout }, left ? -1 : 1);
    });

    let roundDir: -1 | 0 | 1 = 0;
    if (this.roundKeys.down.some((k) => Phaser.Input.Keyboard.JustDown(k))) roundDir = -1;
    if (this.roundKeys.up.some((k) => Phaser.Input.Keyboard.JustDown(k))) roundDir = 1;
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
      const l1 = pad.L1 > 0.5;
      const r1 = pad.R1 > 0.5;
      // Erster Blick: aus der Vorszene gehaltene Tasten zählen nicht als Druck
      const prev = this.padPrev[pad.index] ?? { a: pad.A, b: pad.B, start: false, left, right, up, down, l1, r1 };
      const device: DeviceRef = { kind: 'pad', index: pad.index };
      if (left && !prev.left) this.stepFigure(device, -1);
      if (right && !prev.right) this.stepFigure(device, 1);
      if (l1 && !prev.l1) roundDir = -1;
      if (r1 && !prev.r1) roundDir = 1;
      if (up && !prev.up) mapDir = -1;
      if (down && !prev.down) mapDir = 1;
      if (pad.B && !prev.b) backPressed = true;
      const start = pad.buttons[PAD_START_BUTTON]?.pressed ?? false;
      if (pad.A && !prev.a) this.join(device);
      if (start && !prev.start && this.slots.length > 0) startPressed = true;
      this.padPrev[pad.index] = { a: pad.A, b: pad.B, start, left, right, up, down, l1, r1 };
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
    this.render(time);
  }

  private join(device: DeviceRef): void {
    if (this.slots.length >= MAX_PLAYERS) return;
    if (this.slots.some((s) => sameDevice(s.device, device))) return;
    const n = this.slots.length;
    // Erste freie Figur; Spieler 1 bekommt seinen gemerkten Wunsch (wie online), wenn er frei ist
    const avatar = joinAvatar(this.slots, n === 0 ? loadAvatarWish() : undefined);
    this.slots.push({ id: `p${n + 1}`, color: PLAYER_COLORS[n], device, avatar });
    sfx.play('join');
  }

  /** Figur des Spielers mit diesem Gerät wechseln (vergebene überspringen); Spieler 1 merkt sie sich. */
  private stepFigure(device: DeviceRef, dir: -1 | 1): void {
    const i = this.slots.findIndex((s) => sameDevice(s.device, device));
    if (i < 0) return;
    const next = stepSlotAvatar(this.slots, i, dir);
    if (next === undefined || next === this.slots[i].avatar) return;
    this.slots[i].avatar = next;
    sfx.play('avatar_pick');
    if (i === 0) saveAvatarWish(next);
  }

  private render(time: number): void {
    this.text.setText(this.topLines().join('\n'));
    const panelTop = this.text.y + this.text.height + GAP;
    const frame = previewFrame(time);
    this.panels.forEach((p, i) => this.renderPanel(p, this.slots[i], i, panelTop, frame));
    this.footer.setY(panelTop + PANEL_H + GAP);
    this.footer.setText(this.bottomLines().join('\n'));
  }

  private renderPanel(p: Panel, slot: PlayerSlot | undefined, i: number, top: number, frame: number): void {
    const color = slot ? slot.color : 0x666666;
    p.bg.setY(top).setStrokeStyle(2, color, slot ? 1 : 0.5);
    p.title.setY(top + 6).setText(slot ? `P${i + 1}: ${deviceShort(slot.device)}` : `P${i + 1}: (frei)`);
    p.title.setColor(slot ? toCss(slot.color) : '#888888');
    const figTop = top + 30;
    p.frame.setY(figTop - 3).setStrokeStyle(3, color, 1).setVisible(slot !== undefined);
    const key = slot?.avatar !== undefined ? charTexture(ALL_CHARACTERS[slot.avatar]) : '';
    const shown = slot !== undefined && this.textures.exists(key);
    p.figure.setVisible(shown).setY(figTop);
    if (shown) p.figure.setTexture(key, frame);
    const mid = figTop + (CHAR_FRAME_H * FIGURE_SCALE) / 2;
    p.prev.setY(mid).setVisible(slot !== undefined);
    p.next.setY(mid).setVisible(slot !== undefined);
    p.hint.setY(top + PANEL_H - 20).setText(slot ? `Figur: ${figureKeysHint(slot.device)}` : '');
  }

  private topLines(): string[] {
    return ['Beitreten: Tastatur 1 = E, Tastatur 2 = Enter, Gamepad = A', localRoundLine(this.roundMs), mapLine(this.mapId)];
  }

  private bottomLines(): string[] {
    const lines = [
      'Zurück: Esc oder Gamepad B',
      this.slots.length > 0 ? 'Start: Leertaste oder Start-Taste' : 'Mindestens ein Spieler muss beitreten',
    ];
    if (this.notice) lines.push(this.notice);
    return lines;
  }
}
