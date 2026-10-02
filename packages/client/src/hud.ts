import Phaser from 'phaser';
import { CONFIG } from '@pfandraiders/core';
import type { GameState, Player } from '@pfandraiders/core';
import type { Rect } from './layout';
import type { KeyLabels } from './sources';
import { alertText, hintLines, resultLines, statusLines } from './text';

const FONT = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };
const BAR_WIDTH = 40;
// Statusblock belegt y 4..34, Hinweise wachsen von unten (bis 4 Zeilen); Balken und Warnung liegen dazwischen.
const BAR_Y = 38;
const ALERT_Y = 46;

/**
 * HUD eines Spielers. Alle Objekte hängen an der Kamera (scrollFactor 0) und liegen
 * in den Koordinaten des eigenen Viewports. Die Szene versteckt sie vor den anderen Kameras.
 */
export class PlayerHud {
  readonly objects: Phaser.GameObjects.GameObject[];
  private readonly status: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly alert: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly barBg: Phaser.GameObjects.Rectangle;
  private readonly bar: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, view: Rect, color: number, name: string, private readonly labels: KeyLabels) {
    const wrap = { wordWrap: { width: view.w - 8 } };
    this.status = scene.add.text(4, 4, '', { ...FONT, ...wrap });
    this.hint = scene.add.text(4, view.h - 4, '', { ...FONT, ...wrap }).setOrigin(0, 1);
    this.alert = scene.add
      .text(view.w / 2, ALERT_Y, '', { ...FONT, color: '#ff5252', align: 'center' })
      .setOrigin(0.5, 0);
    this.banner = scene.add
      .text(view.w / 2, view.h / 2, '', {
        ...FONT,
        fontSize: '10px',
        align: 'center',
        backgroundColor: '#000000cc',
      })
      .setOrigin(0.5);
    this.barBg = scene.add
      .rectangle(view.w / 2 - BAR_WIDTH / 2, BAR_Y, BAR_WIDTH, 4, 0x000000)
      .setOrigin(0, 0);
    this.bar = scene.add
      .rectangle(view.w / 2 - BAR_WIDTH / 2, BAR_Y, 0, 4, 0xffee58)
      .setOrigin(0, 0);
    const tag = scene.add
      .text(view.w - 4, 4, name, { ...FONT, color: `#${color.toString(16).padStart(6, '0')}` })
      .setOrigin(1, 0);

    this.objects = [this.status, this.hint, this.alert, this.banner, this.barBg, this.bar, tag];
    for (const o of this.objects) {
      (o as Phaser.GameObjects.Text).setScrollFactor(0).setDepth(10);
    }
    this.bar.setDepth(11);
    this.banner.setDepth(20);
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
    this.bar.setSize(BAR_WIDTH * Math.min(progress, 1), 4);

    const ended = state.phase === 'ended';
    this.banner.setVisible(ended);
    this.banner.setText(ended ? resultLines(state, this.labels).join('\n') : '');
  }
}
