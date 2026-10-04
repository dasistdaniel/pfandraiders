import Phaser from 'phaser';
import { CREDITS, creditDetail, creditLine } from '../credits';
import { KEYBOARD_LAYOUTS } from '../devices';
import { GAME_H, GAME_W } from '../layout';
import { controlLines, MenuModel } from '../menuModel';
import type { MenuItem } from '../menuModel';
import { showOnlineMenu } from '../onlineMenu';
import { music, sfx } from '../sfx';
import { resolveServerUrl } from '../serverUrl';
import { PAD_LABELS } from '../sources';
import { stepVolume } from '../settings';
import { tileTexture } from '../textureKeys';

const STICK_THRESHOLD = 0.5;
const COLOR_NORMAL = '#ffffff';
const COLOR_SELECTED = '#ffee58';

type Page = 'main' | 'settings' | 'credits';
type KeyName = 'up' | 'down' | 'left' | 'right' | 'upW' | 'downS' | 'leftA' | 'rightD' | 'enter' | 'e' | 'space' | 'esc';

interface PadPrev {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  a: boolean;
  b: boolean;
}

const MAIN_ITEMS: MenuItem[] = [
  { id: 'local', label: 'Lokal spielen' },
  { id: 'online', label: 'Online spielen' },
  { id: 'settings', label: 'Einstellungen' },
  { id: 'credits', label: 'Credits' },
];

const SETTINGS_ITEMS: MenuItem[] = [
  { id: 'volume', label: 'Lautstärke' },
  { id: 'music', label: 'Musik' },
  { id: 'mute', label: 'Ton' },
  { id: 'controls', label: 'Steuerung anzeigen' },
  { id: 'back', label: 'Zurück' },
];

const CREDIT_PREFIX = 'credit:';
const CREDIT_ITEMS: MenuItem[] = [
  ...CREDITS.map((c, i) => ({ id: `${CREDIT_PREFIX}${i}`, label: creditLine(c) })),
  { id: 'back', label: 'Zurück' },
];
const PAGE_ITEMS: Record<Page, MenuItem[]> = { main: MAIN_ITEMS, settings: SETTINGS_ITEMS, credits: CREDIT_ITEMS };

const HINT_DEFAULT = 'Pfeile/W S: wählen   Enter/E/Leertaste: bestätigen   Gamepad: Steuerkreuz, A, B';
const HINT_CREDITS = 'Pfeile/W S: wählen   Enter öffnet den Link   Esc zurück   Gamepad: A, B';
/** Credits-Seite: erste Zeile, Abstand je Eintrag (Hauptzeile 16 px, Link 12 px darunter). */
const CREDITS_TOP = 170;
const CREDITS_ROW_H = 56;
const CREDITS_WRAP = GAME_W - 64;

export class MenuScene extends Phaser.Scene {
  private notice = '';
  private page: Page = 'main';
  private model = new MenuModel(MAIN_ITEMS);
  private showControls = false;
  private busy = false;
  private itemTexts: Phaser.GameObjects.Text[] = [];
  /** Zweite, kleine Zeile je Eintrag (nur Credits: Link und Hinweis). */
  private detailTexts: Phaser.GameObjects.Text[] = [];
  private hintText!: Phaser.GameObjects.Text;
  private controlsText!: Phaser.GameObjects.Text;
  private keys!: Record<KeyName, Phaser.Input.Keyboard.Key>;
  private padPrev: Record<number, PadPrev> = {};

  constructor() {
    super('menu');
  }

  init(data?: { notice?: string }): void {
    this.notice = data?.notice ?? '';
  }

  create(): void {
    // Testhilfen ?solo=1 und ?players=N überspringen das Menü (die Lobby startet das Spiel direkt)
    const q = new URLSearchParams(window.location.search);
    if (q.has('solo') || Number(q.get('players')) >= 1) {
      this.scene.start('lobby');
      return;
    }
    this.page = 'main';
    this.showControls = false;
    this.busy = false;
    this.padPrev = {};
    this.itemTexts = [];
    this.detailTexts = [];
    this.model = new MenuModel(MAIN_ITEMS);
    // Ruhige Fassung: langsam, ohne Beat; läuft weiter, falls sie schon spielt
    music.setMode('menu');
    music.setProgress(0);
    music.start();

    this.add.tileSprite(0, 0, GAME_W, GAME_H, tileTexture('city', 'floor_0')).setOrigin(0).setTileScale(2);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.65).setOrigin(0);
    this.add
      .text(GAME_W / 2, 90, 'PfandRaiders', { fontFamily: 'monospace', fontSize: '32px', color: COLOR_SELECTED })
      .setOrigin(0.5);
    if (this.notice) {
      this.add
        .text(GAME_W / 2, 140, this.notice, { fontFamily: 'monospace', fontSize: '16px', color: '#ff8a65', align: 'center' })
        .setOrigin(0.5);
    }
    this.controlsText = this.add
      .text(GAME_W / 2, 400, '', { fontFamily: 'monospace', fontSize: '14px', color: '#cccccc', align: 'center' })
      .setOrigin(0.5, 0);
    this.hintText = this.add
      .text(GAME_W / 2, GAME_H - 24, HINT_DEFAULT, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#999999',
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey('UP'),
      down: kb.addKey('DOWN'),
      left: kb.addKey('LEFT'),
      right: kb.addKey('RIGHT'),
      upW: kb.addKey('W'),
      downS: kb.addKey('S'),
      leftA: kb.addKey('A'),
      rightD: kb.addKey('D'),
      enter: kb.addKey('ENTER'),
      e: kb.addKey('E'),
      space: kb.addKey('SPACE'),
      esc: kb.addKey('ESC'),
    };
    this.rebuild();
  }

  update(): void {
    if (this.busy) return;
    let move: -1 | 0 | 1 = 0;
    let adjust: -1 | 0 | 1 = 0;
    let confirm = false;
    let back = false;
    const JD = Phaser.Input.Keyboard.JustDown;
    const k = this.keys;
    if (JD(k.up) || JD(k.upW)) move = -1;
    else if (JD(k.down) || JD(k.downS)) move = 1;
    if (JD(k.left) || JD(k.leftA)) adjust = -1;
    else if (JD(k.right) || JD(k.rightD)) adjust = 1;
    if (JD(k.enter) || JD(k.e) || JD(k.space)) confirm = true;
    if (JD(k.esc)) back = true;

    for (const pad of this.input.gamepad?.gamepads ?? []) {
      if (!pad || !pad.connected) continue; // abgezogene Pads bleiben in gamepads stehen
      const cur: PadPrev = {
        up: pad.up || pad.leftStick.y < -STICK_THRESHOLD,
        down: pad.down || pad.leftStick.y > STICK_THRESHOLD,
        left: pad.left || pad.leftStick.x < -STICK_THRESHOLD,
        right: pad.right || pad.leftStick.x > STICK_THRESHOLD,
        a: pad.A,
        b: pad.B,
      };
      const prev = this.padPrev[pad.index];
      this.padPrev[pad.index] = cur;
      if (!prev) continue; // erster Blick: aus der Vorszene gehaltene Tasten nicht als Druck werten
      if (move === 0) move = cur.up && !prev.up ? -1 : cur.down && !prev.down ? 1 : 0;
      if (adjust === 0) adjust = cur.left && !prev.left ? -1 : cur.right && !prev.right ? 1 : 0;
      if (cur.a && !prev.a) confirm = true;
      if (cur.b && !prev.b) back = true;
    }

    // Nur eine Aktion pro Frame
    if (move !== 0) {
      this.model.move(move);
      this.render();
    } else if (adjust !== 0) {
      this.adjustVolume(adjust);
    } else if (confirm) {
      this.activate(this.model.activate());
    } else if (back) {
      this.goBack();
    }
  }

  private rebuild(): void {
    for (const t of this.itemTexts) t.destroy();
    for (const t of this.detailTexts) t.destroy();
    this.detailTexts = [];
    const credits = this.page === 'credits';
    this.hintText.setText(credits ? HINT_CREDITS : HINT_DEFAULT);
    this.itemTexts = this.model.items.map((item, i) => {
      const t = credits
        ? this.add
            .text(GAME_W / 2, CREDITS_TOP + i * CREDITS_ROW_H, '', {
              fontFamily: 'monospace',
              fontSize: '16px',
              color: COLOR_NORMAL,
              align: 'center',
              wordWrap: { width: CREDITS_WRAP },
            })
            .setOrigin(0.5, 0)
        : this.add
            .text(GAME_W / 2, 200 + i * 44, '', { fontFamily: 'monospace', fontSize: '24px', color: COLOR_NORMAL })
            .setOrigin(0.5);
      this.bindPointer(t, i);
      const entry = this.creditFor(item.id);
      if (entry) {
        const d = this.add
          .text(GAME_W / 2, t.y + 22, creditDetail(entry), {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#aaaaaa',
            align: 'center',
            wordWrap: { width: CREDITS_WRAP },
          })
          .setOrigin(0.5, 0);
        this.bindPointer(d, i);
        this.detailTexts.push(d);
      }
      return t;
    });
    this.render();
  }

  /** Maus: Überfahren wählt die Zeile, Klick löst sie aus (wie Enter). */
  private bindPointer(t: Phaser.GameObjects.Text, i: number): void {
    t.setInteractive({ useHandCursor: true });
    t.on('pointerover', () => {
      if (this.busy) return;
      this.model.select(i);
      this.render();
    });
    t.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.busy) return;
      this.model.select(i);
      this.render();
      const id = this.model.activate();
      if (id === 'volume' || id === 'music') {
        // Linke Hälfte der Zeile leiser, rechte lauter
        this.adjustVolume(pointer.x < t.x ? -1 : 1);
        return;
      }
      this.activate(id);
    });
  }

  /** Credits-Eintrag zu einer Menü-ID (credit:<Index>), sonst null. */
  private creditFor(id: string): (typeof CREDITS)[number] | null {
    if (!id.startsWith(CREDIT_PREFIX)) return null;
    return CREDITS[Number(id.slice(CREDIT_PREFIX.length))] ?? null;
  }

  private labelFor(item: MenuItem): string {
    if (item.id === 'volume') return `Lautstärke: ◄ ${sfx.volume} % ►`;
    if (item.id === 'music') return `Musik: ◄ ${music.volume} % ►`;
    if (item.id === 'mute') return `Ton: ${sfx.muted ? 'aus' : 'an'}`;
    return item.label;
  }

  private render(): void {
    this.model.items.forEach((item, i) => {
      const sel = i === this.model.selected;
      this.itemTexts[i]
        .setText(`${sel ? '> ' : '  '}${this.labelFor(item)}`)
        .setColor(sel ? COLOR_SELECTED : COLOR_NORMAL);
    });
    this.detailTexts.forEach((d, i) => d.setColor(i === this.model.selected ? '#fff59d' : '#aaaaaa'));
    this.controlsText.setText(
      this.page === 'settings' && this.showControls ? controlLines(KEYBOARD_LAYOUTS, PAD_LABELS).join('\n') : '',
    );
  }

  private activate(id: string): void {
    switch (id) {
      case 'local':
        this.scene.start('lobby');
        break;
      case 'online':
        this.openOnline();
        break;
      case 'settings':
        this.showPage('settings');
        break;
      case 'mute':
        sfx.toggleMute();
        this.render();
        break;
      case 'controls':
        this.showControls = !this.showControls;
        this.render();
        break;
      case 'credits':
        this.showPage('credits');
        break;
      case 'back':
        this.goBack();
        break;
      default: {
        const entry = this.creditFor(id);
        if (entry) window.open(entry.url, '_blank', 'noopener,noreferrer');
        // sonst 'volume' und 'music': ändern sich nur mit links/rechts
      }
    }
  }

  private showPage(page: Page): void {
    const from = this.page;
    this.page = page;
    this.showControls = false;
    this.model = new MenuModel(PAGE_ITEMS[page]);
    // Zurück im Hauptmenü: den Eintrag der verlassenen Seite wieder auswählen
    if (page === 'main') this.model.select(MAIN_ITEMS.findIndex((i) => i.id === from));
    this.rebuild();
  }

  private goBack(): void {
    if (this.page !== 'main') this.showPage('main');
  }

  private adjustVolume(dir: -1 | 1): void {
    if (this.page !== 'settings') return;
    const id = this.model.activate();
    if (id === 'volume') {
      const next = stepVolume(sfx.volume, dir);
      if (next === sfx.volume) return;
      sfx.setVolume(next);
    } else if (id === 'music') {
      const next = stepVolume(music.volume, dir);
      if (next === music.volume) return;
      music.setVolume(next);
    } else {
      return;
    }
    sfx.play('pickup');
    this.render();
  }

  private openOnline(): void {
    const url = resolveServerUrl(window.location.search, import.meta.env.VITE_SERVER_URL as string | undefined);
    this.busy = true;
    this.input.keyboard!.enabled = false; // Tasten gehören dem Eingabefeld
    const done = (): void => {
      this.busy = false;
      if (this.input.keyboard) {
        this.input.keyboard.resetKeys(); // im Eingabefeld gedrückte Tasten nicht als Menü-Eingabe werten
        this.input.keyboard.enabled = true;
      }
    };
    showOnlineMenu(url).then(
      (conn) => {
        done();
        if (conn) this.scene.start('game', { online: conn });
      },
      () => done(),
    );
  }
}
