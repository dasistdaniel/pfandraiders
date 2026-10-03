import Phaser from 'phaser';
import { CONFIG } from '@pfandraiders/core';
import type { GameState, Player } from '@pfandraiders/core';
import type { Rect } from './layout';
import type { KeyLabels } from './sources';
import { alertText, hintLines, resultFooter, resultRows, statusLines } from './text';
import { formatMoney } from './format';

const FONT = { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' };
const BAR_WIDTH = 80;
// Statusblock belegt y 8..68, Hinweise wachsen von unten (bis 4 Zeilen); Balken und Warnung liegen dazwischen.
const BAR_Y = 76;
const ALERT_Y = 92;
const MAX_RESULT_ROWS = 8;
const PANEL_MAX_W = 360;
const PANEL_PAD = 12;
const TITLE_H = 36;
const ROW_H = 22;
const FOOTER_LINE_H = 18;

export type HudRole = 'local' | 'host' | 'guest';

const toCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Ergebnisfeld am Rundenende: Rangliste und Fußzeile, mittig im Viewport. */
class ResultsPanel {
  readonly objects: Phaser.GameObjects.GameObject[];
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly rows: Phaser.GameObjects.Text[];
  private readonly footer: Phaser.GameObjects.Text;
  private readonly panelW: number;

  constructor(scene: Phaser.Scene, private readonly view: Rect) {
    this.panelW = Math.min(PANEL_MAX_W, view.w - 16);
    const inner = this.panelW - 2 * PANEL_PAD;
    this.bg = scene.add.rectangle(view.w / 2, view.h / 2, this.panelW, 100, 0x000000, 0.8).setOrigin(0.5, 0);
    this.title = scene.add
      .text(view.w / 2, 0, 'Runde vorbei!', { ...FONT, fontSize: '24px', color: '#ffee58', align: 'center' })
      .setOrigin(0.5, 0);
    this.rows = Array.from({ length: MAX_RESULT_ROWS }, () =>
      scene.add.text(0, 0, '', { ...FONT, wordWrap: { width: inner } }).setOrigin(0, 0),
    );
    this.footer = scene.add
      .text(view.w / 2, 0, '', { ...FONT, fontSize: '14px', color: '#aaaaaa', align: 'center', wordWrap: { width: inner } })
      .setOrigin(0.5, 0);
    this.objects = [this.bg, this.title, ...this.rows, this.footer];
    this.objects.forEach((o, i) => {
      (o as Phaser.GameObjects.Text).setScrollFactor(0).setDepth(i === 0 ? 20 : 21);
    });
    this.hide();
  }

  hide(): void {
    for (const o of this.objects) (o as Phaser.GameObjects.Text).setVisible(false);
  }

  show(
    state: GameState,
    viewerId: string,
    role: HudRole,
    labels: KeyLabels,
    nameOf: (id: string) => string,
    colorOf: (id: string) => number,
  ): void {
    const rows = resultRows(state, viewerId, nameOf).slice(0, MAX_RESULT_ROWS);
    const footerLines = resultFooter(role, labels);
    const height = PANEL_PAD + TITLE_H + rows.length * ROW_H + 8 + footerLines.length * FOOTER_LINE_H + PANEL_PAD;
    const top = Math.max(0, Math.round((this.view.h - height) / 2));
    const left = Math.round((this.view.w - this.panelW) / 2) + PANEL_PAD;
    this.bg.setPosition(this.view.w / 2, top).setSize(this.panelW, height);
    this.title.setPosition(this.view.w / 2, top + PANEL_PAD);
    this.rows.forEach((t, i) => {
      const row = rows[i];
      t.setVisible(row !== undefined);
      if (!row) return;
      const mark = (row.isWinner ? '★ ' : '') + (row.isViewer ? '> ' : '');
      t.setText(`${mark}${row.place}. ${row.name}  ${formatMoney(row.money)}`);
      t.setColor(toCss(colorOf(row.id)));
      t.setPosition(left, top + PANEL_PAD + TITLE_H + i * ROW_H);
    });
    this.footer.setText(footerLines.join('\n'));
    this.footer.setPosition(this.view.w / 2, top + PANEL_PAD + TITLE_H + rows.length * ROW_H + 8);
    this.bg.setVisible(true);
    this.title.setVisible(true);
    this.footer.setVisible(true);
  }
}

/**
 * HUD eines Spielers. Alle Objekte hängen an der Kamera (scrollFactor 0) und liegen
 * in den Koordinaten des eigenen Viewports (Bildschirmpixel). Sie werden nur von der
 * UI-Kamera ihres Spielers (Zoom 1) gezeichnet, nie von Weltkameras (Zoom 2) oder fremden UI-Kameras.
 */
export class PlayerHud {
  readonly objects: Phaser.GameObjects.GameObject[];
  private readonly status: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly alert: Phaser.GameObjects.Text;
  private readonly results: ResultsPanel;
  private readonly viewerId: string;
  private readonly barBg: Phaser.GameObjects.Rectangle;
  private readonly bar: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, view: Rect, color: number, name: string, private readonly labels: KeyLabels,
    private readonly nameOf: (id: string) => string,
    private readonly role: () => HudRole,
    private readonly colorOf: (id: string) => number = () => 0xffffff,
    viewerId = '',
  ) {
    this.viewerId = viewerId;
    const wrap = { wordWrap: { width: view.w - 16 } };
    this.status = scene.add.text(8, 8, '', { ...FONT, ...wrap });
    this.hint = scene.add.text(4, view.h - 8, '', { ...FONT, ...wrap }).setOrigin(0, 1);
    this.alert = scene.add
      .text(view.w / 2, ALERT_Y, '', { ...FONT, color: '#ff5252', align: 'center', wordWrap: { width: view.w - 16 } })
      .setOrigin(0.5, 0);
    this.results = new ResultsPanel(scene, view);
    this.barBg = scene.add
      .rectangle(view.w / 2 - BAR_WIDTH / 2, BAR_Y, BAR_WIDTH, 8, 0x000000)
      .setOrigin(0, 0);
    this.bar = scene.add
      .rectangle(view.w / 2 - BAR_WIDTH / 2, BAR_Y, 0, 8, 0xffee58)
      .setOrigin(0, 0);
    const tag = scene.add
      .text(view.w - 8, 8, name, { ...FONT, color: `#${color.toString(16).padStart(6, '0')}` })
      .setOrigin(1, 0);

    this.objects = [this.status, this.hint, this.alert, this.barBg, this.bar, tag];
    for (const o of this.objects) {
      (o as Phaser.GameObjects.Text).setScrollFactor(0).setDepth(10);
    }
    this.bar.setDepth(11);
    this.objects.push(...this.results.objects);
  }

  update(state: GameState, p: Player): void {
    this.status.setText(statusLines(state, p).join('\n'));
    this.hint.setText(hintLines(state, p, this.labels).join('\n'));
    this.alert.setText(alertText(state, p));

    let progress = 0;
    if (p.mode === 'searching') {
      progress = p.searchProgressMs / CONFIG.searchMs;
      this.bar.setFillStyle(0xffee58);
    } else if (p.mode === 'stealing') {
      progress = p.stealProgressMs / CONFIG.steal.durationMs;
      this.bar.setFillStyle(0xff5252);
    }
    this.barBg.setVisible(progress > 0);
    this.bar.setVisible(progress > 0);
    this.bar.setSize(BAR_WIDTH * Math.min(progress, 1), 8);

    if (state.phase === 'ended') {
      this.results.show(state, this.viewerId || p.id, this.role(), this.labels, this.nameOf, this.colorOf);
    } else {
      this.results.hide();
    }
  }
}
