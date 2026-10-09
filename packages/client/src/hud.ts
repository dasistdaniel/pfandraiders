import Phaser from 'phaser';
import { CONFIG, searchMsOf } from '@pfandraiders/core';
import type { GameState, Player } from '@pfandraiders/core';
import type { Rect } from './layout';
import type { KeyLabels } from './sources';
import { alertText, hintLines, resultFooter, resultHeader, resultRows, statusLines } from './text';
import { formatMoney } from './format';
import { knockoutFontSizes, knockoutText } from './knockoutView';
import { HEALTH_COLORS, healthBar, healthLabel } from './healthBar';
import { charFrameIndex } from './playerChars';

const FONT = { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' };
const BAR_WIDTH = 80;
// Statusblock belegt y 8..68, Hinweise wachsen von unten (bis 4 Zeilen); Balken und Warnung liegen dazwischen.
const BAR_Y = 76;
const ALERT_Y = 92;
const MAX_RESULT_ROWS = 8;
const PANEL_MAX_W = 440;
const PANEL_PAD = 12;
const TITLE_H = 54;
const ROW_H = 22;
const FOOTER_LINE_H = 18;
/** Countdown-Zahl: so groß im Verhältnis zur kürzeren Viewport-Seite, begrenzt auf [min, max] px */
const COUNTDOWN_FONT = { share: 0.3, min: 48, max: 96 };
/** Fester Lebensbalken oben rechts unter dem Namen, immer sichtbar, mit Zahl ("73/100") */
const HP_HUD = { w: 100, h: 12, y: 30, right: 8 };

export type HudRole = 'local' | 'host' | 'guest';

const toCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Ergebnisfeld am Rundenende: Rangliste und Fußzeile, mittig im Viewport. */
class ResultsPanel {
  readonly objects: Phaser.GameObjects.GameObject[];
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly header: Phaser.GameObjects.Text;
  private readonly rows: Phaser.GameObjects.Text[];
  /** Figur je Zeile (Bild 0 des Bogens); unsichtbar ohne Bogen */
  private readonly images: Phaser.GameObjects.Image[];
  private readonly footer: Phaser.GameObjects.Text;
  private readonly panelW: number;

  constructor(scene: Phaser.Scene, private readonly view: Rect) {
    this.panelW = Math.min(PANEL_MAX_W, view.w - 16);
    const inner = this.panelW - 2 * PANEL_PAD;
    this.bg = scene.add.rectangle(view.w / 2, view.h / 2, this.panelW, 100, 0x000000, 0.8).setOrigin(0.5, 0);
    this.title = scene.add
      .text(view.w / 2, 0, 'Runde vorbei!', { ...FONT, fontSize: '24px', color: '#ffee58', align: 'center' })
      .setOrigin(0.5, 0);
    this.header = scene.add
      .text(0, 0, resultHeader(), { ...FONT, color: '#aaaaaa' }) // gleiche Schrift wie die Zeilen, damit die Spalten passen
      .setOrigin(0, 0);
    this.rows = Array.from({ length: MAX_RESULT_ROWS }, () =>
      scene.add.text(0, 0, '', { ...FONT, wordWrap: { width: inner } }).setOrigin(0, 0),
    );
    this.footer = scene.add
      .text(view.w / 2, 0, '', { ...FONT, fontSize: '14px', color: '#aaaaaa', align: 'center', wordWrap: { width: inner } })
      .setOrigin(0.5, 0);
    this.images = Array.from({ length: MAX_RESULT_ROWS }, () => scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0));
    this.objects = [this.bg, this.title, this.header, ...this.rows, ...this.images, this.footer];
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
    final: boolean,
    charOf: (id: string) => string | null,
  ): void {
    const rows = resultRows(state, viewerId, nameOf).slice(0, MAX_RESULT_ROWS);
    const footerLines = resultFooter(role, labels, final);
    const height = PANEL_PAD + TITLE_H + rows.length * ROW_H + 8 + footerLines.length * FOOTER_LINE_H + PANEL_PAD;
    const top = Math.max(0, Math.round((this.view.h - height) / 2));
    const left = Math.round((this.view.w - this.panelW) / 2) + PANEL_PAD;
    this.bg.setPosition(this.view.w / 2, top).setSize(this.panelW, height);
    this.title.setPosition(this.view.w / 2, top + PANEL_PAD);
    this.header.setPosition(left, top + PANEL_PAD + 34).setVisible(true);
    this.rows.forEach((t, i) => {
      const row = rows[i];
      t.setVisible(row !== undefined);
      if (!row) this.images[i].setVisible(false);
      if (!row) return;
      const mark = (row.isWinner ? '★' : ' ') + (row.isViewer ? '>' : ' ');
      const place = `${mark}${row.place}.`.padEnd(7);
      const name = row.name.padEnd(17);
      t.setText(`${place}${name}${formatMoney(row.round).padStart(9)}  ${formatMoney(row.total).padStart(9)}`);
      t.setColor(toCss(colorOf(row.id)));
      t.setPosition(left, top + PANEL_PAD + TITLE_H + i * ROW_H);
      const img = this.images[i];
      const key = charOf(row.id);
      img.setVisible(key !== null);
      if (key !== null) {
        // Breite eines Zeichens aus der Kopfzeile (gleiche Monospace-Schrift); Bild in der Lücke der Platz-Spalte
        const charW = this.header.width / resultHeader().length;
        img.setTexture(key, charFrameIndex('down', 0)).setPosition(left + charW * 4.6, top + PANEL_PAD + TITLE_H + i * ROW_H + 2);
      }
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
  /** Große Countdown-Anzeige mitten im eigenen Viewport (5..1, LOS!) */
  private readonly countdown: Phaser.GameObjects.Text;
  /** Eigener Lebensbalken im HUD: Rahmen, Füllung, Zahl */
  private readonly hp: { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text };
  /** Große Ausgeknockt-Anzeige mitten im eigenen Viewport: Titel, Restsekunden, "Ausgeraubt!" */
  private readonly knockout: { title: Phaser.GameObjects.Text; seconds: Phaser.GameObjects.Text; robbed: Phaser.GameObjects.Text };

  constructor(scene: Phaser.Scene, view: Rect, color: number, name: string, private labels: KeyLabels,
    private readonly nameOf: (id: string) => string,
    private readonly role: () => HudRole,
    private readonly colorOf: (id: string) => number = () => 0xffffff,
    viewerId = '',
    /** Online nach der letzten Runde: Fußzeile "Weiter zur Endwertung" */
    private readonly isFinal: () => boolean = () => false,
    /** Bogen-Textur der Figur eines Spielers (null = keine), für das Ergebnisfeld */
    private readonly charOf: (id: string) => string | null = () => null,
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

    const size = Math.round(Math.min(COUNTDOWN_FONT.max, Math.max(COUNTDOWN_FONT.min, Math.min(view.w, view.h) * COUNTDOWN_FONT.share)));
    this.countdown = scene.add
      .text(view.w / 2, view.h / 2, '', {
        ...FONT,
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color: '#ffee58',
        stroke: '#000000',
        strokeThickness: Math.round(size / 8),
        align: 'center',
      })
      .setOrigin(0.5)
      .setVisible(false);

    const hpLeft = view.w - HP_HUD.right - HP_HUD.w;
    this.hp = {
      bg: scene.add.rectangle(hpLeft - 1, HP_HUD.y - 1, HP_HUD.w + 2, HP_HUD.h + 2, 0x000000, 0.7).setOrigin(0, 0).setStrokeStyle(1, 0xffffff, 0.6),
      fill: scene.add.rectangle(hpLeft, HP_HUD.y, HP_HUD.w, HP_HUD.h, HEALTH_COLORS.good).setOrigin(0, 0),
      label: scene.add
        .text(hpLeft + HP_HUD.w / 2, HP_HUD.y + HP_HUD.h / 2, '', { ...FONT, fontSize: '12px', stroke: '#000000', strokeThickness: 3 })
        .setOrigin(0.5),
    };

    const ko = knockoutFontSizes(view);
    const big = (fontSize: number, color: string, y: number, originY: number): Phaser.GameObjects.Text =>
      scene.add
        .text(view.w / 2, y, '', {
          ...FONT,
          fontSize: `${fontSize}px`,
          fontStyle: 'bold',
          color,
          stroke: '#000000',
          strokeThickness: Math.max(3, Math.round(fontSize / 8)),
          align: 'center',
        })
        .setOrigin(0.5, originY)
        .setVisible(false);
    // Zahl genau in der Mitte, Titel darüber, "Ausgeraubt!" darunter
    this.knockout = {
      title: big(ko.title, '#ff5252', view.h / 2 - ko.seconds / 2, 1),
      seconds: big(ko.seconds, '#ffee58', view.h / 2, 0.5),
      robbed: big(ko.robbed, '#ffffff', view.h / 2 + ko.seconds / 2 + 4, 0),
    };

    this.objects = [
      this.status, this.hint, this.alert, this.barBg, this.bar, tag, this.countdown,
      this.knockout.title, this.knockout.seconds, this.knockout.robbed,
      this.hp.bg, this.hp.fill, this.hp.label,
    ];
    for (const o of this.objects) {
      (o as Phaser.GameObjects.Text).setScrollFactor(0).setDepth(10);
    }
    this.bar.setDepth(11);
    this.countdown.setDepth(22);
    for (const t of Object.values(this.knockout)) t.setDepth(22);
    this.hp.fill.setDepth(11);
    this.hp.label.setDepth(12);
    this.objects.push(...this.results.objects);
  }

  /** Immer sichtbar (auch bei vollem Leben); ausgeknockt bleibt nur der leere Rahmen mit "0/100". */
  private updateHealth(p: Player): void {
    const view = healthBar(p.health, CONFIG.health.max);
    this.hp.fill
      .setVisible(view.fraction > 0)
      .setSize(Math.max(1, Math.round(HP_HUD.w * view.fraction)), HP_HUD.h)
      .setFillStyle(view.color);
    this.hp.label.setText(healthLabel(p.health, CONFIG.health.max));
  }

  private updateKnockout(ko: ReturnType<typeof knockoutText>): void {
    const { title, seconds, robbed } = this.knockout;
    title.setText(ko?.title ?? '').setVisible(ko !== null);
    seconds.setText(ko?.seconds ?? '').setVisible(ko !== null);
    robbed.setText(ko?.robbed ?? '').setVisible(ko !== null && ko.robbed !== '');
  }

  /** Anderes Gerät (online Auto-Wechsel aufs Gamepad): Tastenhinweise passen sich an. */
  setLabels(labels: KeyLabels): void {
    this.labels = labels;
  }

  /**
   * `notices`: kurze Hinweise (etwa die Beschlagnahme), oben in der Warnung.
   * `countdown`: Text der großen Countdown-Anzeige ('' = keine), siehe CountdownDisplay.
   */
  update(state: GameState, p: Player, notices: string[] = [], countdown = ''): void {
    this.countdown.setText(countdown).setVisible(countdown !== '');
    this.updateKnockout(countdown === '' ? knockoutText(p, state.phase) : null);
    this.updateHealth(p);
    this.status.setText(statusLines(state, p).join('\n'));
    this.hint.setText(hintLines(state, p, this.labels).join('\n'));
    this.alert.setText(alertText(state, p, notices));

    let progress = 0;
    if (p.mode === 'searching') {
      progress = p.searchProgressMs / searchMsOf(p);
      this.bar.setFillStyle(0xffee58);
    }
    this.barBg.setVisible(progress > 0);
    this.bar.setVisible(progress > 0);
    this.bar.setSize(BAR_WIDTH * Math.min(progress, 1), 8);

    if (state.phase === 'ended') {
      this.results.show(state, this.viewerId || p.id, this.role(), this.labels, this.nameOf, this.colorOf, this.isFinal(), this.charOf);
    } else {
      this.results.hide();
    }
  }
}
