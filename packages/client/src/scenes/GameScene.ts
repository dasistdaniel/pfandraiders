import Phaser from 'phaser';
import { CITY_MAP, createGame, isBeingRobbed, ROOM_COLORS, TILE, totalBottles } from '@pfandraiders/core';
import type { GameState, MapData, Npc, ZoneState } from '@pfandraiders/core';
import { LocalConnection } from '../connection';
import type { GameConnection } from '../connection';
import { createSource } from '../devices';
import type { PlayerSlot } from '../devices';
import { initialPose, npcFrame, stepPose } from '../pose';
import type { PoseState } from '../pose';
import { ensurePlayerTextures } from '../textures';
import { dogTexture, objectTexture, playerTexture, policeTexture, spotTexture, tileTexture } from '../textureKeys';
import { tileKey } from '../tiles';
import { PlayerHud } from '../hud';
import { sfx } from '../sfx';
import { detectSounds, snapshotForSound } from '../soundEvents';
import { buildInput } from '../input';
import { viewportsFor, WORLD_ZOOM } from '../layout';
import type { OnlineConnection } from '../online';
import type { InputSource } from '../sources';
import { playerName } from '../text';

/** Nach Rundenende so lange Neustart sperren, damit Dauerdrücken der Aktionstaste die Ergebnisse nicht überspringt. */
const RESTART_DELAY_MS = 1500;

const COLOR = {
  zoneAnnounced: 0xffee58,
  zoneActive: 0xff7043,
};
// Weltraum-Text: Kamerazoom 2 vergrößert ihn, daher doppelte Texturauflösung für scharfe Kanten.
const FONT = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff', resolution: WORLD_ZOOM };

export class GameScene extends Phaser.Scene {
  private slots: PlayerSlot[] = [];
  private conn!: GameConnection;
  private online: OnlineConnection | null = null;
  private sources: InputSource[] = [];
  private huds: PlayerHud[] = [];
  private bodies = new Map<string, Phaser.GameObjects.Image>();
  private poses = new Map<string, PoseState>();
  private npcPoses = new Map<number, PoseState>();
  private warnings = new Map<string, Phaser.GameObjects.Text>();
  private playerColors = new Map<string, number>();
  private spotSprites: Phaser.GameObjects.Image[] = [];
  private spotFull: boolean[] = [];
  private npcSprites = new Map<number, Phaser.GameObjects.Image>();
  private zoneRects: Phaser.GameObjects.Rectangle[] = [];
  private uiCams: Phaser.Cameras.Scene2D.Camera[] = [];
  private zoneLabels: Phaser.GameObjects.Text[] = [];
  private restartKey!: Phaser.Input.Keyboard.Key;
  private endedForMs = 0;
  private menuKey!: Phaser.Input.Keyboard.Key;
  private padBPrev: Record<number, boolean> = {};
  private muteKey!: Phaser.Input.Keyboard.Key;
  /** Zustand des vorigen Frames für Sound-Ereignisse, null = noch keiner (erster Frame ohne Sounds) */
  private prevSoundState: GameState | null = null;
  private ownSoundIds: string[] | 'all' = 'all';

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
    this.padBPrev = {};
    this.prevSoundState = null;
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

    this.spotSprites = [];
    this.spotFull = [];
    this.bodies = new Map();
    this.poses = new Map();
    this.npcPoses = new Map();
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
      this.spotSprites.push(this.add.image(spot.x, spot.y, spotTexture(spot.type, true)));
      this.spotFull.push(true);
    }
    for (const p of Object.values(state.players)) {
      const color = this.playerColors.get(p.id) ?? 0xffffff;
      ensurePlayerTextures(this, color);
      const body = this.add.image(p.x, p.y, playerTexture(color, 'down_a'));
      body.setDepth(5);
      this.bodies.set(p.id, body);
      this.poses.set(p.id, initialPose(p.x, p.y));
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
      cam.setZoom(WORLD_ZOOM);
      cam.setBounds(0, 0, state.map.cols * TILE, state.map.rows * TILE);
      cam.startFollow(this.bodies.get(this.slots[i].id)!, true, 0.15, 0.15);
    });

    // Alles bisher Erzeugte ist Weltobjekt. Die UI-Kameras (Zoom 1, gleicher Viewport) zeigen nur HUDs.
    const worldObjects = [...this.children.list];
    this.uiCams = views.map((v) => this.cameras.add(v.x, v.y, v.w, v.h));
    this.uiCams.forEach((ui) => ui.ignore(worldObjects));

    // Jedes HUD erscheint nur in der UI-Kamera seines Spielers, nie in einer Weltkamera.
    const online = this.online;
    const nameOf = (id: string): string => online?.roster.find((r) => r.id === id)?.name ?? playerName(id);
    const role = (): 'local' | 'host' | 'guest' => (!online ? 'local' : online.isHost() ? 'host' : 'guest');
    const colorOf = (id: string): number => this.playerColors.get(id) ?? 0xffffff;
    this.huds = views.map(
      (v, i) => new PlayerHud(this, v, this.slots[i].color, nameOf(this.slots[i].id), this.sources[i].labels, nameOf, role, colorOf, this.slots[i].id),
    );
    this.huds.forEach((hud, i) => {
      cams.forEach((cam) => cam.ignore(hud.objects));
      this.uiCams.forEach((ui, j) => {
        if (i !== j) ui.ignore(hud.objects);
      });
    });

    this.restartKey = this.input.keyboard!.addKey('R');
    this.menuKey = this.input.keyboard!.addKey('ESC');
    this.muteKey = this.input.keyboard!.addKey('M');
    this.ownSoundIds = this.online ? [this.online.you] : 'all';
    // Tastatur und Maus schaltet der Modul-Listener frei, das Gamepad hier
    const unlock = (): void => sfx.unlock();
    this.input.gamepad?.on('down', unlock);
    this.events.once('shutdown', () => {
      this.input.gamepad?.off('down', unlock);
    });
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
    const menuPressed = Phaser.Input.Keyboard.JustDown(this.menuKey) || this.padBPressed();
    if (state.phase === 'ended') this.endedForMs += delta;
    if (state.phase === 'ended' && this.endedForMs >= RESTART_DELAY_MS && menuPressed) {
      if (this.online) {
        this.online.onClosed = null; // absichtliches Schließen ist kein Verbindungsverlust
        this.online.onStart = null;
        this.online.close();
      }
      this.scene.start('menu');
      return;
    }
    if (state.phase === 'ended' && this.endedForMs >= RESTART_DELAY_MS && (restartPressed || confirmPressed)) {
      if (this.online) {
        this.online.requestStart(); // nur der Host löst aus, alle bekommen danach `start`
      } else {
        this.scene.restart({ slots: this.slots });
        return;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.muteKey)) sfx.toggleMute();
    for (const id of detectSounds(this.prevSoundState, state, this.ownSoundIds)) sfx.play(id);
    this.prevSoundState = snapshotForSound(state);

    state.spots.forEach((spot, i) => {
      const full = totalBottles(spot.contents) > 0;
      if (this.spotFull[i] === full) return;
      this.spotFull[i] = full;
      this.spotSprites[i].setTexture(spotTexture(spot.type, full));
    });
    this.renderZones(state.zones);
    this.renderNpcs(state.npcs, delta);
    for (const p of Object.values(state.players)) {
      const body = this.bodies.get(p.id);
      if (!body) continue; // Spieler, die nach dem Start nicht in der Liste waren
      body.setPosition(p.x, p.y);
      const color = this.playerColors.get(p.id) ?? 0xffffff;
      const { state: poseState, pose } = stepPose(this.poses.get(p.id) ?? initialPose(p.x, p.y), p.x, p.y, p.mode, delta);
      this.poses.set(p.id, poseState);
      body.setTexture(playerTexture(color, pose.frame)).setFlipX(pose.flipX);
      body.setAlpha(p.mode === 'unconscious' ? 0.6 : 1);
      this.warnings.get(p.id)?.setPosition(p.x, p.y - 8).setVisible(isBeingRobbed(state, p.id));
    }
    this.slots.forEach((slot, i) => this.huds[i].update(state, state.players[slot.id]));
  }

  /** Flanke von Gamepad-B; beim ersten Blick auf ein Pad nur den Zustand merken (gehaltene Taste zählt nicht). */
  private padBPressed(): boolean {
    let pressed = false;
    for (const pad of this.input.gamepad?.gamepads ?? []) {
      if (!pad || !pad.connected) continue; // abgezogene Pads bleiben in gamepads stehen
      const prev = this.padBPrev[pad.index];
      this.padBPrev[pad.index] = pad.B;
      if (prev !== undefined && pad.B && !prev) pressed = true;
    }
    return pressed;
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

  private renderNpcs(npcs: Npc[], delta: number): void {
    const alive = new Set<number>();
    for (const npc of npcs) {
      alive.add(npc.id);
      let sprite = this.npcSprites.get(npc.id);
      if (!sprite) {
        const dog = npc.kind === 'dog';
        sprite = this.add
          .image(npc.x, npc.y, dog ? dogTexture('a') : policeTexture('a'))
          .setDepth(4);
        this.npcPoses.set(npc.id, initialPose(npc.x, npc.y));
        for (const ui of this.uiCams) ui.ignore(sprite); // Weltobjekt: nicht in den UI-Kameras
        this.npcSprites.set(npc.id, sprite);
      }
      sprite.setPosition(npc.x, npc.y);
      const nf = npcFrame(this.npcPoses.get(npc.id)!, npc.x, npc.y, delta);
      this.npcPoses.set(npc.id, nf.state);
      sprite.setTexture(npc.kind === 'dog' ? dogTexture(nf.frame) : policeTexture(nf.frame)).setFlipX(nf.flipX);
      sprite.setAlpha(npc.distractedMs > 0 ? 0.5 : 1);
    }
    for (const [id, sprite] of this.npcSprites) {
      if (alive.has(id)) continue;
      sprite.destroy();
      this.npcSprites.delete(id);
      this.npcPoses.delete(id);
    }
  }

  private drawMap(map: MapData): void {
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        this.add.image(c * TILE + TILE / 2, r * TILE + TILE / 2, tileTexture(tileKey(map, c, r))).setDepth(0);
      }
    }
    for (const d of map.dropoffs) this.marker(d.x, d.y, 'dropoff', 'PFAND');
    for (const s of map.shops) this.marker(s.x, s.y, 'shop', 'SHOP');
  }

  private marker(x: number, y: number, object: 'dropoff' | 'shop', label: string): void {
    this.add.image(x, y, objectTexture(object));
    this.add.text(x, y - TILE / 2, label, FONT).setOrigin(0.5, 1);
  }
}
