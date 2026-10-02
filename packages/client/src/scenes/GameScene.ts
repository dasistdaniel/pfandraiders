import Phaser from 'phaser';
import {
  bottlesValue,
  capacityOf,
  CITY_MAP,
  CONFIG,
  containerOf,
  createGame,
  findSearchableSpot,
  isNear,
  nextUpgrade,
  ranking,
  TILE,
  totalBottles,
} from '@pfandraiders/core';
import type { GameState, MapData, Player } from '@pfandraiders/core';
import { LocalConnection } from '../connection';
import { formatMoney, formatTime } from '../format';
import { buildInput } from '../input';

const PLAYER_ID = 'p1';
const FONT = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };
const COLOR = {
  wall: 0x37474f,
  floor: 0x9e9e9e,
  spotFull: 0x66bb6a,
  spotEmpty: 0x616161,
  dropoff: 0x42a5f5,
  shop: 0xffca28,
  player: 0xef5350,
};
const BAR_WIDTH = 40;

export class GameScene extends Phaser.Scene {
  private conn!: LocalConnection;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private playerRect!: Phaser.GameObjects.Rectangle;
  private spotRects: Phaser.GameObjects.Rectangle[] = [];
  private hud!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private barBg!: Phaser.GameObjects.Rectangle;
  private bar!: Phaser.GameObjects.Rectangle;
  private banner!: Phaser.GameObjects.Text;

  constructor() {
    super('game');
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    const seed = params.has('seed')
      ? Number(params.get('seed'))
      : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const roundSec = Number(params.get('round'));
    const state = createGame(seed, CITY_MAP, [PLAYER_ID], {
      roundMs: roundSec > 0 ? roundSec * 1000 : undefined,
    });
    this.conn = new LocalConnection(state, [PLAYER_ID]);

    this.spotRects = [];
    this.drawMap(state.map);
    for (const spot of state.spots) {
      this.spotRects.push(this.add.rectangle(spot.x, spot.y, 10, 10, COLOR.spotFull));
    }
    const me = state.players[PLAYER_ID];
    this.playerRect = this.add.rectangle(me.x, me.y, CONFIG.playerHalf * 2, CONFIG.playerHalf * 2, COLOR.player);
    this.playerRect.setDepth(5);

    this.cameras.main.setBounds(0, 0, state.map.cols * TILE, state.map.rows * TILE);
    this.cameras.main.startFollow(this.playerRect, true, 0.15, 0.15);

    this.hud = this.add.text(4, 4, '', FONT).setScrollFactor(0).setDepth(10);
    this.hint = this.add.text(4, 176, '', FONT).setOrigin(0, 1).setScrollFactor(0).setDepth(10);
    this.barBg = this.add.rectangle(140, 156, BAR_WIDTH, 4, 0x000000).setOrigin(0, 0).setScrollFactor(0).setDepth(10);
    this.bar = this.add.rectangle(140, 156, 0, 4, 0xffee58).setOrigin(0, 0).setScrollFactor(0).setDepth(11);
    this.banner = this.add
      .text(160, 90, '', { ...FONT, fontSize: '10px', align: 'center', backgroundColor: '#000000cc' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);

    this.keys = this.input.keyboard!.addKeys(
      'W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,ONE,R',
    ) as Record<string, Phaser.Input.Keyboard.Key>;
  }

  update(_time: number, delta: number): void {
    const k = this.keys;
    this.conn.setInput(
      PLAYER_ID,
      buildInput({
        left: k.A.isDown || k.LEFT.isDown,
        right: k.D.isDown || k.RIGHT.isDown,
        up: k.W.isDown || k.UP.isDown,
        down: k.S.isDown || k.DOWN.isDown,
        action: k.E.isDown || k.SPACE.isDown,
        buyUpgrade: Phaser.Input.Keyboard.JustDown(k.ONE),
        buyItem: false,
      }),
    );
    this.conn.update(delta);

    const state = this.conn.getState();
    if (state.phase === 'ended' && Phaser.Input.Keyboard.JustDown(k.R)) {
      this.scene.restart();
      return;
    }
    this.render(state, state.players[PLAYER_ID]);
  }

  private drawMap(map: MapData): void {
    const g = this.add.graphics();
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        g.fillStyle(map.solid[r * map.cols + c] ? COLOR.wall : COLOR.floor, 1);
        g.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }
    for (const d of map.dropoffs) this.marker(d.x, d.y, COLOR.dropoff, 'PFAND');
    for (const s of map.shops) this.marker(s.x, s.y, COLOR.shop, 'SHOP');
  }

  private marker(x: number, y: number, color: number, label: string): void {
    this.add.rectangle(x, y, TILE, TILE, color);
    this.add.text(x, y - TILE / 2, label, FONT).setOrigin(0.5, 1);
  }

  private render(state: GameState, p: Player): void {
    this.playerRect.setPosition(p.x, p.y);
    state.spots.forEach((spot, i) => {
      this.spotRects[i].setFillStyle(totalBottles(spot.contents) > 0 ? COLOR.spotFull : COLOR.spotEmpty);
    });

    this.hud.setText(
      `Zeit ${formatTime(state.timeLeftMs)}   Geld ${formatMoney(p.money)}\n` +
        `${containerOf(p).name} ${totalBottles(p.bottles)}/${capacityOf(p)}` +
        `   Pl${p.bottles.plastic} Gl${p.bottles.glass} Ka${p.bottles.crate}`,
    );
    this.hint.setText(this.hintFor(state, p));

    const progress = p.mode === 'searching' ? p.searchProgressMs / CONFIG.searchMs : 0;
    this.barBg.setVisible(progress > 0);
    this.bar.setVisible(progress > 0);
    this.bar.setSize(BAR_WIDTH * progress, 4);

    if (state.phase === 'ended') {
      const best = ranking(state)[0];
      this.banner.setText(`Runde vorbei!\nGeld: ${formatMoney(best.money)}\n\n[R] Neue Runde`);
    } else {
      this.banner.setText('');
    }
    this.banner.setVisible(state.phase === 'ended');
  }

  private hintFor(state: GameState, p: Player): string {
    if (state.phase === 'ended') return '';
    const lines: string[] = [];
    if (isNear(state.map.shops, p)) {
      const up = nextUpgrade(p);
      lines.push(up ? `[1] ${up.name} (${up.capacity} Plätze) ${formatMoney(up.price)}` : 'Voll ausgebaut');
    } else if (isNear(state.map.dropoffs, p)) {
      lines.push(
        totalBottles(p.bottles) > 0
          ? `[E] Pfand abgeben ${formatMoney(bottlesValue(p.bottles))}`
          : 'Pfandautomat: nichts zum Abgeben',
      );
    }
    if (findSearchableSpot(state, p)) {
      lines.push(totalBottles(p.bottles) >= capacityOf(p) ? 'Container voll' : '[E halten] Suchen');
    }
    return lines.join('\n');
  }
}
