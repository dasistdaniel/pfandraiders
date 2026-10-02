import Phaser from 'phaser';
import { CITY_MAP, CONFIG, createGame, isBeingRobbed, TILE, totalBottles } from '@pfandraiders/core';
import type { MapData } from '@pfandraiders/core';
import { LocalConnection } from '../connection';
import { createSource } from '../devices';
import type { PlayerSlot } from '../devices';
import { PlayerHud } from '../hud';
import { buildInput } from '../input';
import { viewportsFor } from '../layout';
import type { InputSource } from '../sources';
import { playerName } from '../text';

const COLOR = {
  wall: 0x37474f,
  floor: 0x9e9e9e,
  spotFull: 0x66bb6a,
  spotEmpty: 0x616161,
  dropoff: 0x42a5f5,
  shop: 0xffca28,
};
const FONT = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };

export class GameScene extends Phaser.Scene {
  private slots: PlayerSlot[] = [];
  private conn!: LocalConnection;
  private sources: InputSource[] = [];
  private huds: PlayerHud[] = [];
  private bodies: Phaser.GameObjects.Rectangle[] = [];
  private warnings: Phaser.GameObjects.Text[] = [];
  private spotRects: Phaser.GameObjects.Rectangle[] = [];
  private restartKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('game');
  }

  init(data: { slots: PlayerSlot[] }): void {
    this.slots = data.slots;
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    const seed = params.has('seed')
      ? Number(params.get('seed'))
      : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const roundSec = Number(params.get('round'));
    const ids = this.slots.map((s) => s.id);
    const state = createGame(seed, CITY_MAP, ids, {
      roundMs: roundSec > 0 ? roundSec * 1000 : undefined,
    });
    this.conn = new LocalConnection(state, ids);
    this.sources = this.slots.map((s) => createSource(this, s.device));

    this.spotRects = [];
    this.bodies = [];
    this.warnings = [];
    this.drawMap(state.map);
    for (const spot of state.spots) {
      this.spotRects.push(this.add.rectangle(spot.x, spot.y, 10, 10, COLOR.spotFull));
    }
    for (const slot of this.slots) {
      const p = state.players[slot.id];
      const body = this.add.rectangle(p.x, p.y, CONFIG.playerHalf * 2, CONFIG.playerHalf * 2, slot.color);
      body.setDepth(5);
      this.bodies.push(body);
      this.warnings.push(
        this.add.text(p.x, p.y - 8, '!', { ...FONT, color: '#ff5252', fontSize: '12px' }).setOrigin(0.5, 1).setDepth(6).setVisible(false),
      );
    }

    // Eine Kamera pro Spieler. Die erste ist Phasers Hauptkamera.
    const views = viewportsFor(this.slots.length);
    const cams = views.map((v, i) =>
      i === 0
        ? this.cameras.main.setViewport(v.x, v.y, v.w, v.h)
        : this.cameras.add(v.x, v.y, v.w, v.h),
    );
    cams.forEach((cam, i) => {
      cam.setBounds(0, 0, state.map.cols * TILE, state.map.rows * TILE);
      cam.startFollow(this.bodies[i], true, 0.15, 0.15);
    });

    // Jedes HUD erscheint nur in der Kamera seines Spielers.
    this.huds = views.map((v, i) => new PlayerHud(this, v, this.slots[i].color, playerName(this.slots[i].id)));
    this.huds.forEach((hud, i) => {
      cams.forEach((cam, j) => {
        if (i !== j) cam.ignore(hud.objects);
      });
    });

    this.restartKey = this.input.keyboard!.addKey('R');
  }

  update(_time: number, delta: number): void {
    this.slots.forEach((slot, i) => {
      this.conn.setInput(slot.id, buildInput(this.sources[i].read()));
    });
    this.conn.update(delta);

    const state = this.conn.getState();
    // JustDown und confirmPressed jeden Frame abfragen und so Druck aus der Spielphase verwerfen,
    // sonst löst ein alter Tastendruck beim Rundenende sofort einen Neustart aus.
    const restartPressed = Phaser.Input.Keyboard.JustDown(this.restartKey);
    const confirmPressed = this.sources.map((s) => s.confirmPressed()).some(Boolean);
    if (state.phase === 'ended' && (restartPressed || confirmPressed)) {
      this.scene.restart({ slots: this.slots });
      return;
    }

    state.spots.forEach((spot, i) => {
      this.spotRects[i].setFillStyle(totalBottles(spot.contents) > 0 ? COLOR.spotFull : COLOR.spotEmpty);
    });
    this.slots.forEach((slot, i) => {
      const p = state.players[slot.id];
      this.bodies[i].setPosition(p.x, p.y);
      this.warnings[i].setPosition(p.x, p.y - 8).setVisible(isBeingRobbed(state, slot.id));
      this.huds[i].update(state, p);
    });
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
}
