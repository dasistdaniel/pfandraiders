import Phaser from 'phaser';
import { CITY_MAP, CONFIG, createGame, isBeingRobbed, ROOM_COLORS, TILE, totalBottles } from '@pfandraiders/core';
import type { GameState, MapData, Npc, ZoneState } from '@pfandraiders/core';
import { LocalConnection } from '../connection';
import type { GameConnection } from '../connection';
import { createSource } from '../devices';
import type { PlayerSlot } from '../devices';
import { PlayerHud } from '../hud';
import { buildInput } from '../input';
import { viewportsFor } from '../layout';
import type { OnlineConnection } from '../online';
import type { InputSource } from '../sources';
import { playerName } from '../text';

/** Nach Rundenende so lange Neustart sperren, damit Dauerdrücken der Aktionstaste die Ergebnisse nicht überspringt. */
const RESTART_DELAY_MS = 1500;

const COLOR = {
  wall: 0x37474f,
  floor: 0x9e9e9e,
  spotFull: 0x66bb6a,
  spotEmpty: 0x616161,
  dropoff: 0x42a5f5,
  shop: 0xffca28,
  dog: 0x8d6e63,
  police: 0x1565c0,
  zoneAnnounced: 0xffee58,
  zoneActive: 0xff7043,
};
const FONT = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };

export class GameScene extends Phaser.Scene {
  private slots: PlayerSlot[] = [];
  private conn!: GameConnection;
  private online: OnlineConnection | null = null;
  private sources: InputSource[] = [];
  private huds: PlayerHud[] = [];
  private bodies = new Map<string, Phaser.GameObjects.Rectangle>();
  private warnings = new Map<string, Phaser.GameObjects.Text>();
  private playerColors = new Map<string, number>();
  private spotRects: Phaser.GameObjects.Rectangle[] = [];
  private npcSprites = new Map<number, Phaser.GameObjects.Rectangle>();
  private zoneRects: Phaser.GameObjects.Rectangle[] = [];
  private zoneLabels: Phaser.GameObjects.Text[] = [];
  private restartKey!: Phaser.Input.Keyboard.Key;
  private endedForMs = 0;

  constructor() {
    super('game');
  }

  init(data?: { slots?: PlayerSlot[]; online?: OnlineConnection }): void {
    this.online = data?.online ?? null;
    this.slots = data?.slots ?? [];
  }

  create(): void {
    if (this.slots.length === 0 && !this.online) {
      this.scene.start('lobby');
      return;
    }
    this.endedForMs = 0;
    let state: GameState;
    this.playerColors = new Map();
    let localParams: URLSearchParams | null = null;
    if (this.online) {
      const online = this.online;
      this.conn = online;
      state = online.getState();
      // Ein Spieler pro Browser, Tastatur 1. Farben kommen aus der Raumliste des Servers.
      for (const r of online.roster) this.playerColors.set(r.id, r.color);
      this.slots = [
        { id: online.you, color: this.playerColors.get(online.you) ?? ROOM_COLORS[0], device: { kind: 'keyboard', layout: 0 } },
      ];
      // Neue Runde (Server schickt erneut `start`) und Verbindungsverlust
      online.onStart = () => this.scene.restart({ online });
      online.onClosed = () => this.scene.start('lobby', { notice: 'Verbindung zum Server verloren.' });
      if (online.status === 'closed') {
        // Das close-Ereignis kam schon vor dem Szenenwechsel an
        this.scene.start('lobby', { notice: 'Verbindung zum Server verloren.' });
        return;
      }
    } else {
      const params = new URLSearchParams(window.location.search);
      localParams = params;
      const seed = params.has('seed')
        ? Number(params.get('seed'))
        : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      const roundSec = Number(params.get('round'));
      const ids = this.slots.map((s) => s.id);
      state = createGame(seed, CITY_MAP, ids, {
        roundMs: roundSec > 0 ? roundSec * 1000 : undefined,
      });
      this.conn = new LocalConnection(state, ids);
      for (const s of this.slots) this.playerColors.set(s.id, s.color);
    }
    this.sources = this.slots.map((s) => createSource(this, s.device));

    this.spotRects = [];
    this.bodies = new Map();
    this.warnings = new Map();
    this.drawMap(state.map);
    this.npcSprites = new Map();
    this.zoneRects = [];
    this.zoneLabels = [];
    for (const z of state.zones) {
      const { x0, y0, x1, y1 } = z.def.area;
      this.zoneRects.push(
        this.add.rectangle((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, COLOR.zoneActive, 0).setDepth(1),
      );
      this.zoneLabels.push(this.add.text(x0 + 2, y0 + 1, z.def.name, FONT).setDepth(2).setVisible(false));
    }
    if (localParams?.get('events') === 'now') {
      // Testhilfe: NPCs und Zonen sofort statt nach Minuten
      state.nextNpcMs = 2000;
      state.zones.forEach((z, i) => {
        z.timerMs = 3000 + i * 4000;
      });
    }
    for (const spot of state.spots) {
      this.spotRects.push(this.add.rectangle(spot.x, spot.y, 10, 10, COLOR.spotFull));
    }
    for (const p of Object.values(state.players)) {
      const color = this.playerColors.get(p.id) ?? 0xffffff;
      const body = this.add.rectangle(p.x, p.y, CONFIG.playerHalf * 2, CONFIG.playerHalf * 2, color);
      body.setDepth(5);
      this.bodies.set(p.id, body);
      this.warnings.set(
        p.id,
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
      cam.startFollow(this.bodies.get(this.slots[i].id)!, true, 0.15, 0.15);
    });

    // Jedes HUD erscheint nur in der Kamera seines Spielers.
    const online = this.online;
    const nameOf = (id: string): string => online?.roster.find((r) => r.id === id)?.name ?? playerName(id);
    this.huds = views.map((v, i) => new PlayerHud(this, v, this.slots[i].color, nameOf(this.slots[i].id), this.sources[i].labels, nameOf));
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
    if (state.phase === 'ended') this.endedForMs += delta;
    if (state.phase === 'ended' && this.endedForMs >= RESTART_DELAY_MS && (restartPressed || confirmPressed)) {
      if (this.online) {
        this.online.requestStart(); // nur der Host löst aus, alle bekommen danach `start`
      } else {
        this.scene.restart({ slots: this.slots });
        return;
      }
    }

    state.spots.forEach((spot, i) => {
      this.spotRects[i].setFillStyle(totalBottles(spot.contents) > 0 ? COLOR.spotFull : COLOR.spotEmpty);
    });
    this.renderZones(state.zones);
    this.renderNpcs(state.npcs);
    for (const p of Object.values(state.players)) {
      const body = this.bodies.get(p.id);
      if (!body) continue; // Spieler, die nach dem Start nicht in der Liste waren
      body.setPosition(p.x, p.y);
      body.setAlpha(p.mode === 'unconscious' ? 0.35 : 1);
      this.warnings.get(p.id)?.setPosition(p.x, p.y - 8).setVisible(isBeingRobbed(state, p.id));
    }
    this.slots.forEach((slot, i) => this.huds[i].update(state, state.players[slot.id]));
  }

  private renderZones(zones: ZoneState[]): void {
    zones.forEach((z, i) => {
      const rect = this.zoneRects[i];
      if (z.phase === 'idle') {
        rect.setFillStyle(COLOR.zoneActive, 0);
        this.zoneLabels[i].setVisible(false);
        return;
      }
      rect.setFillStyle(z.phase === 'active' ? COLOR.zoneActive : COLOR.zoneAnnounced, z.phase === 'active' ? 0.28 : 0.16);
      this.zoneLabels[i].setVisible(true);
    });
  }

  private renderNpcs(npcs: Npc[]): void {
    const alive = new Set<number>();
    for (const npc of npcs) {
      alive.add(npc.id);
      let sprite = this.npcSprites.get(npc.id);
      if (!sprite) {
        const dog = npc.kind === 'dog';
        sprite = this.add
          .rectangle(npc.x, npc.y, dog ? 9 : 8, dog ? 6 : 10, dog ? COLOR.dog : COLOR.police)
          .setDepth(4);
        this.npcSprites.set(npc.id, sprite);
      }
      sprite.setPosition(npc.x, npc.y);
      sprite.setAlpha(npc.distractedMs > 0 ? 0.5 : 1);
    }
    for (const [id, sprite] of this.npcSprites) {
      if (alive.has(id)) continue;
      sprite.destroy();
      this.npcSprites.delete(id);
    }
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
