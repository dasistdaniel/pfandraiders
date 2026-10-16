import Phaser from 'phaser';
import { BOTTLE_ICON_COLORS } from '../bottleIcons';
import { KEYBOARD_LAYOUTS, PLAYER_COLORS } from '../devices';
import { GAME_H, GAME_W } from '../layout';
import { HELP_LAYOUT, helpDevices, helpPages, pageLabel, stepPage } from '../helpPages';
import type { HelpEntry, HelpIcon, HelpPage } from '../helpPages';
import { DOG_ANIMS, OFFICER_ANIMS } from '../npcAnim';
import { saveHelpSeen } from '../settings';
import { sfx } from '../sfx';
import { PAD_LABELS, PAD_TAB_LABELS } from '../sources';
import { charTexture, dogTexture, npcSheetTexture, objectTexture, playerTexture, policeTexture, spotTexture, tileTexture } from '../textureKeys';

/** Woher die Anleitung kam: Hauptmenü (zurück per Szenenwechsel) oder Esc-Menü im Spiel (liegt darüber). */
export type HelpFrom = 'menu' | 'game';

const STICK_THRESHOLD = 0.5;
const FONT = 'monospace';
/** Inhalt: Bilder mittig bei x 86, Text der Punkte ab x 110, Tabelle ab x 70; oben y 76 (siehe HELP_LAYOUT). */
const CONTENT = { top: 76, tableX: 70, textX: 110, iconX: 86, iconBox: 24 };
const COLOR = { text: '#eeeeee', heading: '#81d4fa', title: '#ffee58', tableHead: '#ffee58', dim: '#999999' };
const ARROW = { y: GAME_H / 2, left: 36, right: GAME_W - 36 };
const DOTS = { y: 492, gap: 18, r: 5 };
const HINT = 'Links/rechts, A/D, LB/RB: blättern   Esc/B: zurück';

/** Wurde die Anleitung in dieser Sitzung schon geöffnet (für den Hinweis im Hauptmenü, falls der Speicher gesperrt ist)? */
let openedThisSession = false;
export function helpOpenedThisSession(): boolean {
  return openedThisSession;
}

interface PadPrev {
  left: boolean;
  right: boolean;
  lb: boolean;
  rb: boolean;
  b: boolean;
}

type KeyName = 'left' | 'right' | 'a' | 'd' | 'pageUp' | 'pageDown' | 'esc' | 'backspace';

export class HelpScene extends Phaser.Scene {
  private from: HelpFrom = 'menu';
  private pages: HelpPage[] = [];
  private index = 0;
  private content: Phaser.GameObjects.GameObject[] = [];
  private title!: Phaser.GameObjects.Text;
  private pageText!: Phaser.GameObjects.Text;
  private dots: Phaser.GameObjects.Arc[] = [];
  private arrows!: { left: Phaser.GameObjects.Text; right: Phaser.GameObjects.Text };
  private keys!: Record<KeyName, Phaser.Input.Keyboard.Key>;
  private padPrev: Record<number, PadPrev> = {};

  constructor() {
    super('help');
  }

  init(data?: { from?: HelpFrom }): void {
    this.from = data?.from ?? 'menu';
    this.sys.settings.data = {};
  }

  create(): void {
    openedThisSession = true;
    saveHelpSeen();
    this.index = 0;
    this.padPrev = {};
    this.content = [];
    this.pages = helpPages({
      devices: helpDevices(KEYBOARD_LAYOUTS, PAD_LABELS, PAD_TAB_LABELS),
      localMax: PLAYER_COLORS.length,
    });

    this.add.tileSprite(0, 0, GAME_W, GAME_H, tileTexture('city', 'floor_0')).setOrigin(0).setTileScale(2);
    // Deckt auch das Spiel darunter ab und fängt Klicks, damit sie nicht ins Esc-Menü durchgehen
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.82).setOrigin(0).setInteractive();
    this.add.text(GAME_W / 2, 12, 'So wird gespielt', { fontFamily: FONT, fontSize: '14px', color: COLOR.dim }).setOrigin(0.5, 0);
    this.title = this.add.text(GAME_W / 2, 32, '', { fontFamily: FONT, fontSize: '26px', color: COLOR.title }).setOrigin(0.5, 0);

    const arrow = (x: number, label: string, dir: -1 | 1): Phaser.GameObjects.Text =>
      this.add
        .text(x, ARROW.y, label, { fontFamily: FONT, fontSize: '36px', color: COLOR.text })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.turn(dir));
    this.arrows = { left: arrow(ARROW.left, '◄', -1), right: arrow(ARROW.right, '►', 1) };

    const n = this.pages.length;
    const x0 = GAME_W / 2 - ((n - 1) * DOTS.gap) / 2;
    this.dots = this.pages.map((_, i) =>
      this.add
        .circle(x0 + i * DOTS.gap, DOTS.y, DOTS.r, 0xffffff)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.show(i)),
    );
    this.pageText = this.add
      .text(x0 + (n - 1) * DOTS.gap + 24, DOTS.y, '', { fontFamily: FONT, fontSize: '14px', color: COLOR.dim })
      .setOrigin(0, 0.5);
    this.add.text(GAME_W / 2, GAME_H - 24, HINT, { fontFamily: FONT, fontSize: '14px', color: COLOR.dim }).setOrigin(0.5);
    // Maus: "Zurück" unten links (wie Esc/B)
    const back = this.add
      .text(24, DOTS.y, '◄ Zurück', { fontFamily: FONT, fontSize: '16px', color: COLOR.text })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => back.setColor(COLOR.title))
      .on('pointerout', () => back.setColor(COLOR.text))
      .on('pointerdown', () => this.close());

    const kb = this.input.keyboard!;
    this.keys = {
      left: kb.addKey('LEFT'),
      right: kb.addKey('RIGHT'),
      a: kb.addKey('A'),
      d: kb.addKey('D'),
      pageUp: kb.addKey('PAGE_UP'),
      pageDown: kb.addKey('PAGE_DOWN'),
      esc: kb.addKey('ESC'),
      backspace: kb.addKey('BACKSPACE'),
    };
    this.show(0);
  }

  update(): void {
    const JD = Phaser.Input.Keyboard.JustDown;
    const k = this.keys;
    let dir: -1 | 0 | 1 = 0;
    let back = false;
    if (JD(k.left) || JD(k.a) || JD(k.pageUp)) dir = -1;
    else if (JD(k.right) || JD(k.d) || JD(k.pageDown)) dir = 1;
    if (JD(k.esc) || JD(k.backspace)) back = true;

    for (const pad of this.input.gamepad?.gamepads ?? []) {
      if (!pad || !pad.connected) continue; // abgezogene Pads bleiben in gamepads stehen
      const cur: PadPrev = {
        left: pad.left || pad.leftStick.x < -STICK_THRESHOLD,
        right: pad.right || pad.leftStick.x > STICK_THRESHOLD,
        lb: pad.L1 > 0.5,
        rb: pad.R1 > 0.5,
        b: pad.B,
      };
      const prev = this.padPrev[pad.index];
      this.padPrev[pad.index] = cur;
      if (!prev) continue; // erster Blick: aus der Vorszene gehaltene Tasten nicht als Druck werten
      if (dir === 0) dir = (cur.left && !prev.left) || (cur.lb && !prev.lb) ? -1 : (cur.right && !prev.right) || (cur.rb && !prev.rb) ? 1 : 0;
      if (cur.b && !prev.b) back = true;
    }

    // Nur eine Aktion pro Frame
    if (back) this.close();
    else if (dir !== 0) this.turn(dir);
  }

  private turn(dir: -1 | 1): void {
    const next = stepPage(this.index, dir, this.pages.length);
    if (next !== this.index) this.show(next);
  }

  private show(i: number): void {
    if (i !== this.index || this.content.length > 0) sfx.play('ui_move');
    this.index = i;
    for (const o of this.content) o.destroy();
    this.content = [];
    const page = this.pages[i];
    const n = this.pages.length;
    this.title.setText(page.title);
    this.pageText.setText(pageLabel(i, n));
    this.dots.forEach((d, j) => d.setFillStyle(j === i ? 0xffee58 : 0x666666));
    this.arrows.left.setAlpha(i > 0 ? 1 : 0.25);
    this.arrows.right.setAlpha(i < n - 1 ? 1 : 0.25);

    const L = HELP_LAYOUT;
    let y = CONTENT.top;
    page.entries.forEach((e, j) => {
      if (j > 0) y += L.entryGapPx + (e.kind === 'heading' ? L.headingGapPx : 0);
      y += this.drawEntry(e, y);
    });
    if (y > CONTENT.top + L.contentH) console.warn(`Anleitung: Seite "${page.title}" ist ${y - CONTENT.top} px hoch`);
  }

  /** Zeichnet einen Eintrag ab y und gibt seine Höhe zurück (gemessen, mindestens das Budget je Zeile). */
  private drawEntry(e: HelpEntry, y: number): number {
    const linePx = HELP_LAYOUT.linePx;
    const style = (color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: FONT,
      fontSize: '16px',
      color,
      lineSpacing: 4,
    });
    if (e.kind === 'table') {
      // Kopfzeile farbig, darunter eine Zeile je Gerät
      const head = this.add.text(CONTENT.tableX, y, e.lines[0], style(COLOR.tableHead));
      const body = this.add.text(CONTENT.tableX, y + linePx, e.lines.slice(1).join('\n'), style(COLOR.text));
      this.content.push(head, body);
      return Math.max(e.lines.length * linePx, linePx + body.height);
    }
    const x = e.kind === 'heading' ? CONTENT.tableX : CONTENT.textX;
    const t = this.add.text(x, y, e.lines.join('\n'), style(e.kind === 'heading' ? COLOR.heading : COLOR.text));
    this.content.push(t);
    if (e.icon) this.content.push(...this.drawIcon(e.icon, CONTENT.iconX, y + linePx / 2));
    return Math.max(e.lines.length * linePx, t.height);
  }

  /** Kleines Bild aus vorhandenen Texturen, eingepasst in ein Quadrat von CONTENT.iconBox Pixeln. */
  private drawIcon(icon: HelpIcon, x: number, y: number): Phaser.GameObjects.GameObject[] {
    const box = CONTENT.iconBox;
    const image = (key: string, frame?: number): Phaser.GameObjects.GameObject[] => {
      if (!this.textures.exists(key)) return [];
      const img = this.add.image(x, y, key, frame);
      img.setScale(Math.min(box / img.width, box / img.height));
      return [img];
    };
    const sheetOr = (sheet: string, frame: number, fallback: string): Phaser.GameObjects.GameObject[] =>
      this.textures.exists(sheet) ? image(sheet, frame) : image(fallback);
    switch (icon) {
      case 'bottles': {
        const kinds = ['plastic', 'glass', 'crate'] as const;
        return kinds.map((kind, i) => this.add.rectangle(x - 8 + i * 8, y, 6, 14, BOTTLE_ICON_COLORS[kind]));
      }
      case 'spot':
        return image(spotTexture('city', 'bin', true));
      case 'dropoff':
        return image(objectTexture('city', 'dropoff'));
      case 'player':
        return sheetOr(charTexture('m02'), 0, playerTexture(PLAYER_COLORS[0], 'down_a'));
      case 'dog':
        return sheetOr(npcSheetTexture('dog-white'), DOG_ANIMS.idle.frames[0], dogTexture('a'));
      case 'police':
        return sheetOr(npcSheetTexture('officer'), OFFICER_ANIMS.idle.frames[0], policeTexture('a'));
      case 'money': {
        const coin = this.add.circle(x, y, 9, 0xffd54f).setStrokeStyle(2, 0xc49000);
        const sign = this.add.text(x, y, '€', { fontFamily: FONT, fontSize: '12px', color: '#6d4c00' }).setOrigin(0.5);
        return [coin, sign];
      }
    }
  }

  private close(): void {
    sfx.play('ui_back');
    if (this.from === 'game') this.scene.stop();
    else this.scene.start('menu', { select: 'help' });
  }
}
