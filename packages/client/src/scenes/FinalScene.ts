import Phaser from 'phaser';
import { createSource } from '../devices';
import { finalFooter, finalRows, winnerText } from '../finalView';
import { formatMoney } from '../format';
import { GAME_H, GAME_W } from '../layout';
import type { OnlineConnection } from '../online';
import { charFrameIndex, characterOfAvatar } from '../playerChars';
import { loadOnlineDevice } from '../settings';
import { sfx } from '../sfx';
import { ShopNav } from '../shopNav';
import type { InputSource } from '../sources';
import { charTexture } from '../textureKeys';

const MAX_ROWS = 8;
const ROW_H = 36;
const TOP = 112;
const FONT = { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff' };
const toCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Endwertung der Serie (Phase final): Rangliste nach Gesamtverdienst mit Figur und Gesamtsieger.
 * Nur der Host holt alle zurück in die Lobby; die anderen warten. Esc verlässt den Raum.
 */
export class FinalScene extends Phaser.Scene {
  private online: OnlineConnection | null = null;
  private leaving = false;
  private requested = false;
  private source!: InputSource;
  /** Aktionstaste nur als neuer Druck (eine aus Rangliste oder Shop gehaltene Taste zählt nicht) */
  private nav = new ShopNav();
  private escKey!: Phaser.Input.Keyboard.Key;
  private winner!: Phaser.GameObjects.Text;
  private rowImages: Phaser.GameObjects.Image[] = [];
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private footer!: Phaser.GameObjects.Text;
  private button!: Phaser.GameObjects.Text;

  constructor() {
    super('final');
  }

  init(data?: { online?: OnlineConnection }): void {
    this.online = data?.online ?? null;
    this.leaving = false;
    this.requested = false;
    this.nav = new ShopNav();
    this.rowImages = [];
    this.rowTexts = [];
  }

  create(): void {
    const online = this.online;
    if (!online) {
      this.scene.start('menu');
      return;
    }
    this.escKey = this.input.keyboard!.addKey('ESC');
    this.source = createSource(this, loadOnlineDevice());
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.9).setOrigin(0, 0);
    this.add.text(GAME_W / 2, 20, 'Endwertung', { ...FONT, fontSize: '32px', color: '#ffee58' }).setOrigin(0.5, 0);
    this.winner = this.add.text(GAME_W / 2, 66, '', { ...FONT, fontSize: '20px', align: 'center', wordWrap: { width: GAME_W - 40 } }).setOrigin(0.5, 0);
    const left = GAME_W / 2 - 220;
    for (let i = 0; i < MAX_ROWS; i++) {
      const y = TOP + i * ROW_H;
      this.rowImages.push(this.add.image(left, y + 10, charTexture('m01'), charFrameIndex('down', 0)).setScale(2).setVisible(false));
      this.rowTexts.push(this.add.text(left + 26, y, '', FONT).setVisible(false));
    }
    this.button = this.add
      .text(GAME_W / 2, GAME_H - 64, '[ Zur Lobby ]', { ...FONT, fontSize: '22px', color: '#ffee58' })
      .setOrigin(0.5, 1)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.button.on('pointerdown', () => this.requestLobby());
    this.footer = this.add.text(GAME_W / 2, GAME_H - 12, '', { ...FONT, fontSize: '16px', color: '#aaaaaa', align: 'center' }).setOrigin(0.5, 1);

    online.onPhase = () => {
      if (online.roomPhase === 'lobby') this.backToLobby();
    };
    online.onClosed = () => this.leave('Verbindung zum Server verloren.');
    online.onStart = null;
    online.onError = null;
    online.onShopState = null;
    online.onJoined = null;
    online.onLobby = null;
    online.onChat = null;
    if (online.status === 'closed') this.leave('Verbindung zum Server verloren.');
    else if (online.roomPhase === 'lobby') this.backToLobby();
  }

  update(_time: number, delta: number): void {
    const online = this.online;
    if (!online || this.leaving) return;
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.leave();
      return;
    }
    // Wie im Shop: Was beim ersten Bild schon gedrückt ist (Aktionstaste von "Serie beenden" oder der Rangliste),
    // zählt nicht; sonst würde der Host die Endwertung sofort für alle überspringen
    for (const cmd of this.nav.update(this.source.read(), delta)) {
      if (cmd === 'confirm') this.requestLobby();
    }
    this.render(online);
  }

  /** Jedes Bild neu: Ranglistenzeilen, Gesamtsieger und Fußzeile (ein neuer Host bekommt sofort den Knopf). */
  private render(online: OnlineConnection): void {
    const rows = finalRows(online.ranking, online.roster, online.you).slice(0, MAX_ROWS);
    this.winner.setText(winnerText(rows));
    this.rowTexts.forEach((t, i) => {
      const row = rows[i];
      const img = this.rowImages[i];
      t.setVisible(row !== undefined);
      img.setVisible(row !== undefined && row.avatar !== null);
      if (!row) return;
      const mark = (row.isWinner ? '★' : ' ') + (row.isViewer ? '>' : ' ');
      t.setText(`${mark}${`${row.place}.`.padEnd(4)}${row.name.padEnd(17)}${formatMoney(row.total).padStart(10)}`);
      t.setColor(toCss(row.color));
      if (row.avatar !== null) {
        const key = charTexture(characterOfAvatar(row.avatar, i));
        if (this.textures.exists(key)) img.setTexture(key, charFrameIndex('down', 0));
        else img.setVisible(false);
      }
    });
    const host = online.isHost();
    this.button.setVisible(host);
    this.footer.setText(finalFooter(host, this.source.labels.action).join('\n'));
  }

  /** Nur der Host: alle zurück in die Lobby (einmal; der Server bestätigt mit phase lobby). */
  private requestLobby(): void {
    const online = this.online;
    if (!online || this.requested || !online.isHost()) return;
    this.requested = true;
    sfx.play('pickup');
    online.toLobby();
  }

  /** Der Raum ist wieder in der Lobby: dieselbe Verbindung im Online-Dialog weiterführen. */
  private backToLobby(): void {
    if (this.leaving || !this.online) return;
    this.leaving = true;
    const online = this.online;
    online.onPhase = null;
    online.onClosed = null;
    this.scene.start('menu', { resumeOnline: online });
  }

  /** Raum verlassen (Platz freigeben) und ins Menü. */
  private leave(notice?: string): void {
    if (this.leaving) return;
    this.leaving = true;
    const online = this.online;
    if (online) {
      online.onPhase = null;
      online.onClosed = null;
      online.leave();
      online.close();
    }
    this.scene.start('menu', notice ? { notice } : undefined);
  }
}
