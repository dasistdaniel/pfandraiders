import Phaser from 'phaser';
import { BUY_REFUSAL_TEXT, freshProgress, ROOM_COLORS } from '@pfandraiders/core';
import type { Progress } from '@pfandraiders/core';
import { createSource } from '../devices';
import type { PlayerSlot } from '../devices';
import { formatMoney } from '../format';
import { GAME_H, GAME_W, viewportsFor } from '../layout';
import type { Rect } from '../layout';
import { LocalShop } from '../localShop';
import type { OnlineConnection } from '../online';
import { loadOnlineDevice } from '../settings';
import type { SoundId } from '../audioIds';
import { preferAlternatives } from '../eventSounds';
import { sfx } from '../sfx';
import { ShopModel, shopPointerEnabled } from '../shopModel';
import type { ShopAction, ShopRowView } from '../shopModel';
import { ShopNav } from '../shopNav';
import type { InputSource } from '../sources';
import { playerName } from '../text';

export interface ShopSceneData {
  /** Lokal: Spieler, ihr Fortschritt nach der Runde und die Rundenzeit der Serie */
  slots?: PlayerSlot[];
  progress?: Record<string, Progress>;
  roundMs?: number;
  /** Online: Verbindung (Stand und Bereit kommen vom Server) */
  online?: OnlineConnection;
}

const COLOR = { text: '#ffffff', grey: '#777777', selected: '#ffee58', message: '#ff8a80', hint: '#aaaaaa' };
const MESSAGE_MS = 2500;
/** Höchstens so viele Zeilen hat eine Kategorie (bis 3 Einträge, Bereit, Serie beenden) */
const MAX_ROWS = 6;

interface PanelUi {
  bg: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  money: Phaser.GameObjects.Text;
  cats: Phaser.GameObjects.Text[];
  rows: Phaser.GameObjects.Text[];
  message: Phaser.GameObjects.Text;
  others: Phaser.GameObjects.Text;
  hint: Phaser.GameObjects.Text;
}

interface Panel {
  id: string;
  name: string;
  color: number;
  view: Rect;
  model: ShopModel;
  nav: ShopNav;
  source: InputSource;
  ui: PanelUi;
  message: string;
  messageMs: number;
}

const toCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Shop-Phase zwischen zwei Runden: ein Feld je lokalem Spieler (online eines), Bedienung nur mit Bewegungs- und Aktionstaste. */
export class ShopScene extends Phaser.Scene {
  private panels: Panel[] = [];
  private online: OnlineConnection | null = null;
  private local: LocalShop | null = null;
  private slots: PlayerSlot[] = [];
  private roundMs: number | undefined;
  private escKey!: Phaser.Input.Keyboard.Key;
  private leaving = false;
  private lastMoney: number | null = null;
  private lastCart: number | null = null;

  constructor() {
    super('shop');
  }

  init(data?: ShopSceneData): void {
    this.online = data?.online ?? null;
    this.slots = data?.slots ?? [];
    this.roundMs = data?.roundMs;
    this.local = this.online ? null : new LocalShop(this.slots.map((s) => s.id), data?.progress ?? {});
    this.panels = [];
    this.leaving = false;
    this.lastMoney = null;
    this.lastCart = null;
  }

  create(): void {
    if (!this.online && this.slots.length === 0) {
      this.scene.start('menu');
      return;
    }
    this.escKey = this.input.keyboard!.addKey('ESC');
    const online = this.online;
    if (online) {
      const me = online.roster.find((r) => r.id === online.you);
      const view = { x: 0, y: 0, w: GAME_W, h: GAME_H };
      this.panels.push(this.makePanel(online.you, me?.name ?? 'Du', me?.color ?? ROOM_COLORS[0], view, createSource(this, loadOnlineDevice()), online.isHost()));
      this.lastMoney = online.shop?.money ?? null;
      this.lastCart = online.shop?.items.cart ?? null;
      online.onShopState = () => {
        const money = online.shop?.money ?? null;
        const cart = online.shop?.items.cart ?? null;
        if (money !== null && this.lastMoney !== null && money < this.lastMoney) {
          playAll(cart !== null && this.lastCart !== null && cart > this.lastCart ? ['buy', 'cart_rent'] : ['buy']);
        }
        this.lastMoney = money;
        this.lastCart = cart;
        this.panels[0]?.model.setReady(online.shopReady);
      };
      online.onStart = () => this.goTo('game', { online });
      online.onPhase = () => {
        // Host beendet die Serie: Endwertung; nach der Endwertung zurück in die Lobby
        if (online.roomPhase === 'final') this.goTo('final', { online });
        else if (online.roomPhase === 'lobby') this.goTo('menu', { resumeOnline: online });
      };
      online.onError = (_code, message) => this.say(this.panels[0], message);
      online.onClosed = () => this.leaveOnline('Verbindung zum Server verloren.');
      online.onLobby = null;
      online.onJoined = null;
      this.panels[0].model.setReady(online.shopReady);
      if (online.status === 'closed') this.leaveOnline('Verbindung zum Server verloren.');
      // Serie ist zu Ende (letzte Runde oder vom Host beendet), während dieser Spieler noch auf der Rangliste stand
      else if (online.roomPhase === 'final') this.goTo('final', { online });
      else if (online.roomPhase === 'lobby') this.goTo('menu', { resumeOnline: online });
      else sfx.play('shop_start');
    } else {
      const views = viewportsFor(this.slots.length);
      this.slots.forEach((s, i) => {
        this.panels.push(this.makePanel(s.id, playerName(s.id), s.color, views[i], createSource(this, s.device), false));
      });
      sfx.play('shop_start');
    }
  }

  update(_time: number, delta: number): void {
    if (this.leaving) return;
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      sfx.play('ui_back');
      if (this.online) this.leaveOnline();
      else this.goTo('menu', {});
      return;
    }
    for (const panel of this.panels) {
      const progress = this.progressOf(panel.id);
      for (const cmd of panel.nav.update(panel.source.read(), delta)) {
        if (cmd === 'confirm') this.run(panel, panel.model.activate(progress));
        else {
          panel.model.move(cmd, progress);
          sfx.play('ui_move');
        }
      }
      panel.messageMs = Math.max(0, panel.messageMs - delta);
      this.render(panel);
    }
    if (this.local?.allReady()) {
      this.goTo('game', { slots: this.slots, progress: this.local.result(), roundMs: this.roundMs });
    }
  }

  private progressOf(id: string): Progress {
    if (this.local) return this.local.progress(id);
    return this.online?.shop ?? freshProgress();
  }

  private run(panel: Panel, action: ShopAction | null): void {
    if (!action) return;
    switch (action.kind) {
      case 'refused':
        sfx.play('buy_denied');
        this.say(panel, BUY_REFUSAL_TEXT[action.reason]);
        return;
      case 'buy':
        if (this.local) {
          const r = this.local.buy(panel.id, action.category, action.item, action.qty);
          if (r.ok) playAll(action.item === 'cart' ? ['buy', 'cart_rent'] : ['buy']);
          else {
            sfx.play('buy_denied');
            this.say(panel, BUY_REFUSAL_TEXT[r.reason]);
          }
        } else {
          this.online?.shopBuy(action.category, action.item, action.qty);
        }
        return;
      case 'ready':
        sfx.play(action.ready ? 'ready' : 'ready_off');
        if (this.local) this.local.setReady(panel.id, action.ready);
        else this.online?.setReady(action.ready);
        return;
      case 'endSeries':
        this.online?.endSeries();
        return;
    }
  }

  private say(panel: Panel | undefined, text: string): void {
    if (!panel) return;
    panel.message = text;
    panel.messageMs = MESSAGE_MS;
  }

  private makePanel(id: string, name: string, color: number, view: Rect, source: InputSource, canEndSeries: boolean): Panel {
    // Splitscreen (halbe Breite oder Höhe): kleinere Schrift, damit Zeilen mit Preis nicht umbrechen
    const small = view.h < 300 || view.w < 600;
    const size = small ? 13 : 16;
    const font = { fontFamily: 'monospace', fontSize: `${size}px`, color: COLOR.text };
    const x = view.x + 12;
    const bg = this.add.rectangle(view.x, view.y, view.w, view.h, 0x000000, 0.85).setOrigin(0, 0).setStrokeStyle(2, color, 1);
    const title = this.add.text(x, view.y + 8, '', { ...font, fontSize: `${size + 4}px`, color: toCss(color) });
    const money = this.add.text(x, view.y + 8 + size + 10, '', font);
    const catY = view.y + 8 + 2 * (size + 10);
    const cats = [0, 1, 2, 3].map((i) => this.add.text(x + i * Math.floor((view.w - 24) / 4), catY, '', font));
    const rowH = size + 8;
    const rowsY = catY + size + 14;
    const rows = Array.from({ length: MAX_ROWS }, (_, i) =>
      this.add.text(x, rowsY + i * rowH, '', { ...font, wordWrap: { width: view.w - 24 } }),
    );
    const message = this.add.text(x, rowsY + MAX_ROWS * rowH + 4, '', { ...font, color: COLOR.message });
    const others = this.add.text(x, rowsY + MAX_ROWS * rowH + size + 10, '', { ...font, color: COLOR.hint, wordWrap: { width: view.w - 24 } });
    const hint = this.add
      .text(x, view.y + view.h - 8, '', { ...font, fontSize: `${size - 2}px`, color: COLOR.hint, wordWrap: { width: view.w - 24 } })
      .setOrigin(0, 1);
    const panel: Panel = {
      id,
      name,
      color,
      view,
      model: new ShopModel({ canEndSeries }),
      nav: new ShopNav(),
      source,
      ui: { bg, title, money, cats, rows, message, others, hint },
      message: '',
      messageMs: 0,
    };
    if (shopPointerEnabled(this.online !== null)) this.wireMouse(panel, font, x, view.y + view.h - 8 - 2 * (size + 10));
    return panel;
  }

  /** Nur online: Klick auf Kategorie und Eintrag wählt, Knöpfe für Menge, Kaufen, Bereit, Serie beenden. */
  private wireMouse(panel: Panel, font: Phaser.Types.GameObjects.Text.TextStyle, x: number, y: number): void {
    const progress = (): Progress => this.progressOf(panel.id);
    panel.ui.cats.forEach((t, i) => {
      t.setInteractive({ useHandCursor: true }).on('pointerdown', () => panel.model.selectCategory(i));
    });
    panel.ui.rows.forEach((t, i) => {
      t.setInteractive({ useHandCursor: true }).on('pointerdown', () => panel.model.selectRow(i));
    });
    const buttons: [string, () => void][] = [
      ['[ − ]', () => panel.model.changeQty(-1, progress())],
      ['[ + ]', () => panel.model.changeQty(1, progress())],
      ['[ Kaufen ]', () => this.run(panel, panel.model.buyAction(progress()))],
      ['[ Bereit ]', () => this.run(panel, panel.model.toggleReady())],
    ];
    if (this.online?.isHost()) buttons.push(['[ Serie beenden ]', () => this.run(panel, { kind: 'endSeries' })]);
    let bx = x;
    for (const [label, onClick] of buttons) {
      const b = this.add.text(bx, y, label, { ...font, color: COLOR.selected }).setInteractive({ useHandCursor: true });
      b.on('pointerdown', onClick);
      bx += b.width + 12;
    }
  }

  private render(panel: Panel): void {
    const p = this.progressOf(panel.id);
    const ui = panel.ui;
    ui.title.setText(`Shop – ${panel.name}`);
    ui.money.setText(`Geld ${formatMoney(p.money)}   Gesamtverdienst ${formatMoney(p.earnedTotal)}`);
    panel.model.categories().forEach((c, i) => {
      ui.cats[i].setText(c.selected ? `[${c.name}]` : c.name).setColor(c.selected ? COLOR.selected : COLOR.text);
    });
    const rows = panel.model.rows(p);
    ui.rows.forEach((t, i) => {
      const r = rows[i];
      t.setVisible(r !== undefined);
      if (r) t.setText(rowText(r)).setColor(rowColor(r));
    });
    ui.message.setText(panel.messageMs > 0 ? panel.message : '');
    ui.others.setText(this.othersText(panel));
    const action = panel.source.labels.action;
    ui.hint.setText(`Hoch/runter: wählen   Links/rechts: Kategorie oder Menge   ${action}: kaufen / bereit   Esc: verlassen`);
  }

  /** Wer ist schon bereit? Online aus der Raumliste, lokal aus dem lokalen Shop. */
  private othersText(panel: Panel): string {
    if (this.online) {
      const list = this.online.roster.filter((r) => r.connected).map((r) => `${r.ready ? '✓' : '…'} ${r.name}`);
      return `Bereit: ${list.join('   ')}`;
    }
    const ready = this.local?.isReady(panel.id) ?? false;
    return ready ? 'Warte auf die anderen…' : '';
  }

  private goTo(scene: 'game' | 'menu' | 'final', data: object): void {
    if (this.leaving) return;
    this.leaving = true;
    if (this.online) {
      this.online.onShopState = null;
      this.online.onPhase = null;
      this.online.onError = null;
      this.online.onClosed = null;
      if (scene !== 'game') this.online.onStart = null;
    }
    this.scene.start(scene, data);
  }

  /** Online verlassen: Platz freigeben (außer die Verbindung ist schon weg) und ins Menü. */
  private leaveOnline(notice?: string): void {
    const online = this.online;
    if (online) {
      online.onStart = null;
      online.leave();
      online.close();
    }
    this.goTo('menu', notice ? { notice } : {});
  }
}

/** Kauf-Töne: 'cart_rent' ersetzt 'buy', wenn es dafür eine eigene Datei gibt. */
function playAll(ids: SoundId[]): void {
  for (const id of preferAlternatives(ids, (x) => sfx.hasFile(x))) sfx.play(id);
}

function rowText(r: ShopRowView): string {
  const mark = r.selected ? '> ' : '  ';
  const detail = r.detail ? `  ${r.detail}` : '';
  const price = r.price ? `   ${r.price}` : '';
  return `${mark}${r.name}${detail}${price}`;
}

function rowColor(r: ShopRowView): string {
  if (r.selected) return COLOR.selected;
  return r.state === 'grey' ? COLOR.grey : COLOR.text;
}
