import Phaser from 'phaser';
import { createGame, DEFAULT_MAP_ID, isMapId, MAP_DEFS, NO_INPUT, ROOM_COLORS, TILE, totalBottles } from '@pfandraiders/core';
import type { GameState, MapData, MapId, Npc, Progress, ZoneState } from '@pfandraiders/core';
import { LocalConnection } from '../connection';
import type { GameConnection } from '../connection';
import { createSource } from '../devices';
import { isSwinging } from '../fightView';
import { LocalShop } from '../localShop';
import type { PlayerSlot } from '../devices';
import { bobOffset, initialPose, npcFrame, stepPose } from '../pose';
import type { PoseState } from '../pose';
import { CHAR_ORIGIN_Y, charFrameIndex, characterFor, characterIndex } from '../playerChars';
import { bakeMapLayers, ensurePlayerTextures } from '../textures';
import { charTexture, dogTexture, mapTexture, objectTexture, playerTexture, policeTexture, spotTexture, tileTexture } from '../textureKeys';
import { advanceClock, dogAnim, npcLook, policeAnim } from '../npcAnim';
import type { AnimClock } from '../npcAnim';
import type { TilesetId } from '../textureKeys';
import { tileKey } from '../tiles';
import { CountdownDisplay, musicModeFor } from '../countdown';
import { PlayerHud } from '../hud';
import { audioToggles, cycleAudio, music, sfx, unlockAudio } from '../sfx';
import { PLING_GAP_SEC } from '../sound';
import { detectSeizures, detectSounds, snapshotForSound } from '../soundEvents';
import { Notices } from '../notices';
import { buildInput } from '../input';
import { GAME_H, GAME_W, viewportsFor, WORLD_ZOOM } from '../layout';
import { PauseMenu, pauseHint, pauseLabel, pauseTitle } from '../pauseMenu';
import type { PauseAction } from '../pauseMenu';
import type { OnlineConnection } from '../online';
import { padBLeaves } from '../sources';
import type { InputSource } from '../sources';
import { audioNoticeText, autoSwitchTarget, deviceLabel, loadAutoSwitch, loadLocalRoundMs, loadOnlineDevice, saveOnlineDevice } from '../settings';
import { playerName, seizeText } from '../text';
import { CONNECT_STALL_MS, JoinedWatch, ReconnectPlan } from '../reconnect';

/** Nach Rundenende so lange Neustart sperren, damit Dauerdrücken der Aktionstaste die Ergebnisse nicht überspringt. */
const RESTART_DELAY_MS = 1500;
/** Maßstab des Polizisten aus dem Bogen (Figur etwa 30 px hoch, Spieler 17 px); zum späteren Feintuning. */
const POLICE_SCALE = 0.6;

/** Farbring unter den Füßen: Mitte 4 px unter der Position (Füße enden 5 px darunter), Tiefe zwischen NPCs (4) und Figur (5). */
const RING = { w: 12, h: 6, dy: 4, depth: 4.5, fillAlpha: 0.25, strokeAlpha: 0.8 };

const COLOR = {
  zoneAnnounced: 0xffee58,
  zoneActive: 0xff7043,
};
// Weltraum-Text: Kamerazoom 2 vergrößert ihn, daher doppelte Texturauflösung für scharfe Kanten.
const FONT = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff', resolution: WORLD_ZOOM };

/** Esc-Menü: Feld mittig über dem ganzen Bild, Zeilenabstand der Einträge, Tiefe über HUD und Wiederverbindungstext. */
const PAUSE = { w: 340, pad: 16, titleH: 32, rowH: 30, hintGap: 10, hintH: 20, depth: 40, maxItems: 3 };
const PAUSE_COLOR = { normal: '#ffffff', selected: '#ffee58', hint: '#aaaaaa' };
const PAD_START_BUTTON = 9;
const STICK_THRESHOLD = 0.5;
type NavKey = 'up' | 'down' | 'w' | 's' | 'enter' | 'e' | 'space';
interface PadNav {
  up: boolean;
  down: boolean;
  a: boolean;
  b: boolean;
  start: boolean;
}
/** Eingaben des Esc-Menüs in einem Frame (Flanken, gehaltene Tasten zählen nicht). */
interface MenuNav {
  move: -1 | 0 | 1;
  confirm: boolean;
  back: boolean;
  start: boolean;
}
interface PauseUi {
  bg: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  items: Phaser.GameObjects.Text[];
  hint: Phaser.GameObjects.Text;
}

export class GameScene extends Phaser.Scene {
  private slots: PlayerSlot[] = [];
  /** Lokale Serie: Fortschritt aus der Shop-Phase (leer in der ersten Runde) und Rundenzeit der Serie. */
  private progress: Record<string, Progress> | undefined;
  private roundMs: number | undefined;
  private conn!: GameConnection;
  /** Kennung der gespielten Karte (online vom Server, lokal aus ?map=). */
  private mapId: MapId = DEFAULT_MAP_ID;
  /** Kachelsatz der Karte (aus MAP_DEFS), bestimmt die Texturschlüssel von Karte, Spots und Markern. */
  private tileset: TilesetId = DEFAULT_MAP_ID;
  private online: OnlineConnection | null = null;
  private sources: InputSource[] = [];
  private huds: PlayerHud[] = [];
  private bodies = new Map<string, Phaser.GameObjects.Image>();
  /** Texturschlüssel des Figurenbogens je Spieler, null = Bogen fehlt, gezeichnete Figur als Rückfall. */
  private charKeys = new Map<string, string | null>();
  private rings = new Map<string, Phaser.GameObjects.Ellipse>();
  private poses = new Map<string, PoseState>();
  private npcPoses = new Map<number, PoseState>();
  /** Unsichtbare, nicht wippende Kamera-Ziele, damit die Kamera beim Gehen nicht ruckelt. */
  private followTargets = new Map<string, Phaser.GameObjects.Zone>();
  private playerColors = new Map<string, number>();
  private spotSprites: Phaser.GameObjects.Image[] = [];
  private spotFull: boolean[] = [];
  private npcSprites = new Map<number, Phaser.GameObjects.Sprite>();
  /** Uhr der Bogen-Animation je NPC (beginnt bei jedem Wechsel der Animation von vorn). */
  private npcClocks = new Map<number, AnimClock>();
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
  /** Kurze HUD-Hinweise je Spieler (Beschlagnahme durch die Polizei). */
  private notices = new Notices();
  /** Nur online: läuft, solange die Verbindung weg ist und wir automatisch neu verbinden. */
  private plan: ReconnectPlan | null = null;
  private overlay: Phaser.GameObjects.Text | null = null;
  private joinedWatch: JoinedWatch | null = null;
  private connectingMs = 0;
  private joinedSeen = false;
  private enterKey!: Phaser.Input.Keyboard.Key;
  /** Rundenlänge für den Musikfortschritt: größte gesehene Restzeit (online erst ab dem ersten Zustand bekannt). */
  private roundTotalMs = 0;
  /** Esc-Menü (lokal pausiert es das Spiel, online läuft es weiter). */
  private pause = new PauseMenu();
  /** Countdown vor der Runde (5..1, LOS!); in jedem Viewport mittig im HUD */
  private countdown = new CountdownDisplay();
  /** Eigene Kamera über dem ganzen Bild, die nur das Esc-Menü zeigt. */
  private pauseCam: Phaser.Cameras.Scene2D.Camera | null = null;
  private pauseUi: PauseUi | null = null;
  /**
   * Menütasten. E, Enter, W, S und Pfeile sind dieselben Key-Objekte wie die der Spieler-Eingabequellen;
   * JustDown darauf würde denen den Druck wegnehmen, daher eigene Flanken aus isDown.
   */
  private navKeys!: Record<NavKey, Phaser.Input.Keyboard.Key>;
  private navPrev: Partial<Record<NavKey, boolean>> = {};
  private padNavPrev: Record<number, PadNav> = {};
  /** Online: Auto-Wechsel aufs Gamepad erlaubt (Einstellung) und Index des Pads, dessen Taste zuletzt gedrückt wurde. */
  private autoSwitch = true;
  private pendingPad: number | null = null;

  constructor() {
    super('game');
  }

  init(data?: { slots?: PlayerSlot[]; online?: OnlineConnection; progress?: Record<string, Progress>; roundMs?: number }): void {
    this.online = data?.online ?? null;
    this.slots = data?.slots ?? [];
    this.progress = data?.progress;
    this.roundMs = data?.roundMs;
  }

  create(): void {
    if (this.slots.length === 0 && !this.online) {
      this.scene.start('lobby');
      return;
    }
    this.endedForMs = 0;
    this.plan = null;
    this.overlay = null;
    this.joinedWatch = null;
    this.connectingMs = 0;
    this.joinedSeen = false;
    this.padBPrev = {};
    this.prevSoundState = null;
    this.notices = new Notices();
    this.roundTotalMs = 0;
    this.pause = new PauseMenu();
    this.countdown = new CountdownDisplay();
    this.pauseCam = null;
    this.pauseUi = null;
    this.navPrev = {};
    this.padNavPrev = {};
    this.pendingPad = null;
    this.autoSwitch = loadAutoSwitch();
    let state: GameState;
    this.playerColors = new Map();
    let localParams: URLSearchParams | null = null;
    if (this.online) {
      const online = this.online;
      this.conn = online;
      state = online.getState();
      this.mapId = online.mapId;
      // Ein Spieler pro Browser mit dem Gerät aus den Einstellungen. Farben kommen aus der Raumliste des Servers.
      for (const r of online.roster) this.playerColors.set(r.id, r.color);
      this.slots = [
        { id: online.you, color: this.playerColors.get(online.you) ?? ROOM_COLORS[0], device: loadOnlineDevice() },
      ];
      // Neue Runde (Server schickt erneut `start`) und Verbindungsverlust
      online.onStart = () => this.scene.restart({ online });
      online.onClosed = () => this.beginReconnect();
      // Host beendet die Serie, während hier noch die Rangliste steht
      online.onPhase = () => {
        if (online.roomPhase === 'lobby') this.leaveToMenu('Der Host hat die Serie beendet.');
      };
      online.onError = (code) => {
        // Nur während des Wiederverbindens: endgültige Fehler beenden den Versuch
        if (this.plan?.fatal(code)) this.leaveToMenu('Platz im Raum nicht mehr verfügbar.');
      };
      if (online.status === 'closed' && !online.room) {
        // Ohne Raum gibt es nichts, wohin wir zurückkehren könnten
        this.scene.start('menu', { notice: 'Verbindung zum Server verloren.' });
        return;
      }
    } else {
      const params = new URLSearchParams(window.location.search);
      localParams = params;
      const seed = params.has('seed')
        ? Number(params.get('seed'))
        : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      const roundSec = Number(params.get('round'));
      const mapParam = params.get('map');
      this.mapId = isMapId(mapParam) ? mapParam : DEFAULT_MAP_ID;
      const ids = this.slots.map((s) => s.id);
      // ?round= (Testhilfe) hat Vorrang, sonst die Wahl aus der Lobby, sonst die gespeicherte
      if (roundSec > 0) this.roundMs = roundSec * 1000;
      this.roundMs ??= loadLocalRoundMs();
      state = createGame(seed, MAP_DEFS[this.mapId].map, ids, { roundMs: this.roundMs, progress: this.progress });
      this.conn = new LocalConnection(state, ids);
      for (const s of this.slots) this.playerColors.set(s.id, s.color);
    }
    this.tileset = MAP_DEFS[this.mapId].tileset;
    this.sources = this.slots.map((s) => createSource(this, s.device));

    this.spotSprites = [];
    this.spotFull = [];
    this.bodies = new Map();
    this.charKeys = new Map();
    this.rings = new Map();
    this.poses = new Map();
    this.npcPoses = new Map();
    this.drawMap(state.map);
    this.npcSprites = new Map();
    this.npcClocks = new Map();
    this.zoneRects = [];
    this.zoneLabels = [];
    for (const z of state.zones) {
      const { x0, y0, x1, y1 } = z.def.area;
      this.zoneRects.push(
        this.add.rectangle((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, COLOR.zoneActive, 0).setDepth(1),
      );
      this.zoneLabels.push(this.add.text(x0 + 2, y0 + 1, z.def.name, FONT).setDepth(7).setVisible(false));
    }
    if (localParams?.get('events') === 'now') {
      // Testhilfe: NPCs und Zonen sofort statt nach Minuten
      state.nextNpcMs = 2000;
      state.zones.forEach((z, i) => {
        z.timerMs = 3000 + i * 4000;
      });
    }
    for (const spot of state.spots) {
      this.spotSprites.push(this.add.image(spot.x, spot.y, spotTexture(this.tileset, spot.type, true)));
      this.spotFull.push(true);
    }
    // Figur je Spieler nach Position: online Reihenfolge der Raumliste, lokal Slot-Index, sonst Reihenfolge im Zustand
    const orderIds = this.online ? this.online.roster.map((r) => r.id) : this.slots.map((s) => s.id);
    const playerIds = Object.keys(state.players);
    for (const p of Object.values(state.players)) {
      const color = this.playerColors.get(p.id) ?? 0xffffff;
      const sheet = charTexture(characterFor(characterIndex(p.id, orderIds, playerIds)));
      const charKey = this.textures.exists(sheet) ? sheet : null;
      this.charKeys.set(p.id, charKey);
      this.rings.set(
        p.id,
        this.add
          .ellipse(p.x, p.y + RING.dy, RING.w, RING.h, color, RING.fillAlpha)
          .setStrokeStyle(1, color, RING.strokeAlpha)
          .setDepth(RING.depth),
      );
      let body: Phaser.GameObjects.Image;
      if (charKey) {
        body = this.add.image(p.x, p.y, charKey, charFrameIndex('down', 0)).setOrigin(0.5, CHAR_ORIGIN_Y);
      } else {
        ensurePlayerTextures(this, color);
        body = this.add.image(p.x, p.y, playerTexture(color, 'down_a'));
      }
      body.setDepth(5);
      this.bodies.set(p.id, body);
      this.followTargets.set(p.id, this.add.zone(p.x, p.y, 1, 1));
      this.poses.set(p.id, initialPose(p.x, p.y));
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
      cam.startFollow(this.followTargets.get(this.slots[i].id)!, true, 0.15, 0.15);
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

    if (online) {
      // Wiederverbindungs-Hinweis: Text nur in der UI-Kamera des lokalen Spielers (Viewport-Mitte)
      const v = views[0];
      this.overlay = this.add
        .text(v.w / 2, v.h / 2, '', {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#ffffff',
          backgroundColor: '#000000cc',
          padding: { x: 10, y: 8 },
          align: 'center',
          wordWrap: { width: v.w - 32 },
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(30)
        .setVisible(false);
      cams.forEach((cam) => cam.ignore(this.overlay!));
      this.uiCams.forEach((ui, j) => {
        if (j !== 0) ui.ignore(this.overlay!);
      });
    }

    this.createPauseMenu([...cams, ...this.uiCams]);

    this.restartKey = this.input.keyboard!.addKey('R');
    this.enterKey = this.input.keyboard!.addKey('ENTER');
    this.menuKey = this.input.keyboard!.addKey('ESC');
    this.muteKey = this.input.keyboard!.addKey('M');
    const kb = this.input.keyboard!;
    this.navKeys = {
      up: kb.addKey('UP'),
      down: kb.addKey('DOWN'),
      w: kb.addKey('W'),
      s: kb.addKey('S'),
      enter: kb.addKey('ENTER'),
      e: kb.addKey('E'),
      space: kb.addKey('SPACE'),
    };
    this.ownSoundIds = this.online ? [this.online.you] : 'all';
    // Verbindung schon vor dem Szenenwechsel weg (Rennen zwischen Menü und Spielszene)
    if (online && online.status === 'closed') this.beginReconnect();
    // Tastatur und Maus schaltet der Modul-Listener frei, das Gamepad hier
    const unlock = (): void => unlockAudio();
    this.input.gamepad?.on('down', unlock);
    // Online: merkt sich das Pad für den Auto-Wechsel (ausgewertet am Anfang von update)
    const padDown = (pad: Phaser.Input.Gamepad.Gamepad): void => {
      if (this.online) this.pendingPad = pad.index;
    };
    this.input.gamepad?.on('down', padDown);
    this.events.once('shutdown', () => {
      this.input.gamepad?.off('down', unlock);
      this.input.gamepad?.off('down', padDown);
      if (this.online) this.online.onJoined = null;
    });
  }

  update(_time: number, delta: number): void {
    // Esc genau einmal je Frame lesen (kein alter Druck bleibt liegen); die Menütasten ebenfalls jeden Frame.
    // Gerät für B als 'zurück' vor dem Auto-Wechsel: der Druck, der wechselt, soll nicht zugleich hinauswerfen
    const deviceBefore = this.slots[0]?.device;
    this.applyAutoSwitch();
    const escPressed = Phaser.Input.Keyboard.JustDown(this.menuKey);
    const nav = this.readMenuNav();
    // Das Esc-Menü gibt es nur in der laufenden Runde ohne Wiederverbindung; sonst gilt das bisherige Esc.
    const menuAllowed = !this.plan && this.conn.getState().phase !== 'ended';
    if (!menuAllowed) {
      if (this.pause.isOpen) this.closePause();
    } else if (this.handlePauseInput(escPressed, nav)) {
      return; // Spiel verlassen
    }
    const paused = this.pause.isOpen;
    // Lokal hält das Menü die Runde an (auch den Rundentimer). Online läuft sie weiter und die eigene Figur
    // steht still; update() schickt weiter das Lebenszeichen. Die Quellen werden trotzdem gelesen,
    // damit ihre Flanken (Kauftasten) nach dem Schließen nicht nachträglich auslösen.
    const frozen = paused && !this.online;
    this.slots.forEach((slot, i) => {
      const keys = this.sources[i].read();
      this.conn.setInput(slot.id, paused ? { ...NO_INPUT } : buildInput(keys));
    });
    if (!frozen) this.conn.update(delta);
    const viewDelta = frozen ? 0 : delta;

    const state = this.conn.getState();
    this.updateMusic(state, frozen);
    // JustDown und confirmPressed jeden Frame abfragen und so Druck aus der Spielphase verwerfen,
    // sonst löst ein alter Tastendruck beim Rundenende sofort einen Neustart aus.
    const restartPressed = Phaser.Input.Keyboard.JustDown(this.restartKey);
    const confirmPressed = this.sources.map((s) => s.confirmPressed()).some(Boolean);
    // Esc zählt hier nur, wenn das Esc-Menü nicht zuständig war (Rundenende, Wiederverbindung).
    // Online zählt nur das B des gewählten Gamepads, und nur am Rundenende: beim Wiederverbinden nur Esc,
    // denn B ist Ausrauben und ein Verbindungsabbruch mitten im Ausrauben soll nicht hinauswerfen.
    const padB = padBLeaves(this.online !== null, deviceBefore, this.padBPresses());
    const escMenu = !menuAllowed && escPressed;
    const menuPressed = escMenu || padB;
    if (this.plan && this.tickReconnect(delta, this.online ? escMenu : menuPressed)) return;
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
    if (state.phase === 'ended' && this.endedForMs >= RESTART_DELAY_MS && !this.plan && (restartPressed || confirmPressed)) {
      if (this.online) {
        const online = this.online;
        online.onClosed = null;
        online.onError = null;
        online.onJoined = null;
        this.scene.start('shop', { online });
      } else {
        const ids = this.slots.map((s) => s.id);
        this.scene.start('shop', { slots: this.slots, progress: LocalShop.fromState(state, ids), roundMs: this.roundMs });
      }
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.muteKey)) {
      this.cycleSound();
      this.renderPause(); // Beschriftung "Ton: ..." im offenen Menü
    }
    // Mehrere Plings eines Frames (online: mehrere Flaschen pro Snapshot) nacheinander abspielen
    let plings = 0;
    for (const id of detectSounds(this.prevSoundState, state, this.ownSoundIds)) {
      sfx.play(id, id === 'pling' ? PLING_GAP_SEC * plings++ : 0);
    }
    this.notices.tick(viewDelta);
    for (const z of detectSeizures(this.prevSoundState, state, this.ownSoundIds)) this.notices.show(z.id, seizeText(z.count));
    this.prevSoundState = snapshotForSound(state);

    state.spots.forEach((spot, i) => {
      const full = totalBottles(spot.contents) > 0;
      if (this.spotFull[i] === full) return;
      this.spotFull[i] = full;
      this.spotSprites[i].setTexture(spotTexture(this.tileset, spot.type, full));
    });
    this.renderZones(state.zones);
    this.renderNpcs(state.npcs, viewDelta);
    for (const p of Object.values(state.players)) {
      const body = this.bodies.get(p.id);
      if (!body) continue; // Spieler, die nach dem Start nicht in der Liste waren
      this.followTargets.get(p.id)?.setPosition(p.x, p.y);
      const color = this.playerColors.get(p.id) ?? 0xffffff;
      const { state: poseState, pose, moving, dir, step } = stepPose(this.poses.get(p.id) ?? initialPose(p.x, p.y), p.x, p.y, p.mode, viewDelta);
      this.poses.set(p.id, poseState);
      const unconscious = p.mode === 'unconscious';
      const charKey = this.charKeys.get(p.id) ?? null;
      body.setPosition(p.x, p.y + bobOffset(poseState.walkMs, moving));
      if (charKey) {
        // Bogenfigur: Richtung über die Spalte (links hat eine eigene Spalte), daher nie spiegeln.
        // Bewusstlos: kein Liegebild im Satz, also das Standbild vorn um 90 Grad gedreht, mittig auf der Position.
        body
          .setTexture(charKey, charFrameIndex(dir, step))
          .setFlipX(false)
          .setOrigin(0.5, unconscious ? 0.5 : CHAR_ORIGIN_Y)
          .setAngle(unconscious ? 90 : 0);
      } else {
        body.setTexture(playerTexture(color, pose.frame)).setFlipX(pose.flipX);
      }
      body.setAlpha(unconscious ? 0.6 : 1);
      body.setScale(isSwinging(p) ? 1.15 : 1);
      this.rings.get(p.id)?.setPosition(p.x, p.y + RING.dy);
    }
    const countdownText = this.countdown.update(state.countdownMs, viewDelta, state.phase);
    this.slots.forEach((slot, i) => this.huds[i].update(state, state.players[slot.id], this.notices.lines(slot.id), countdownText));
  }

  /**
   * Musik folgt der Runde: schneller und dichter gegen Ende, nach Rundenende und in der lokalen Pause leise und ruhig.
   * Während des Countdowns bleibt die bisherige Musik (Fortschritt 0, die Rundenzeit steht), mit "LOS!" beginnt die Spielmusik.
   */
  private updateMusic(state: GameState, paused: boolean): void {
    if (Number.isFinite(state.timeLeftMs) && state.timeLeftMs > this.roundTotalMs) this.roundTotalMs = state.timeLeftMs;
    const progress = this.roundTotalMs > 0 ? 1 - state.timeLeftMs / this.roundTotalMs : 0;
    music.setProgress(progress);
    const mode = musicModeFor(state, paused);
    if (mode) music.setMode(mode);
  }

  /**
   * Esc-Menü als ein Overlay über dem ganzen Bild, auch im Splitscreen: eine zusätzliche Kamera (Zoom 1,
   * ganze Fläche, zuletzt angelegt und damit obenauf) zeigt nur die Menüobjekte; alle anderen Kameras
   * ignorieren sie. Später erzeugte Weltobjekte (NPCs) ignoriert sie in renderNpcs.
   */
  private createPauseMenu(otherCams: Phaser.Cameras.Scene2D.Camera[]): void {
    const others = [...this.children.list];
    const text = (size: number, color: string): Phaser.GameObjects.Text =>
      this.add
        .text(GAME_W / 2, 0, '', {
          fontFamily: 'monospace',
          fontSize: `${size}px`,
          color,
          align: 'center',
          wordWrap: { width: PAUSE.w - 2 * PAUSE.pad },
        })
        .setOrigin(0.5, 0);
    const bg = this.add
      .rectangle(GAME_W / 2, 0, PAUSE.w, 100, 0x000000, 0.82)
      .setOrigin(0.5, 0)
      .setStrokeStyle(2, 0x888888, 1);
    const title = text(20, PAUSE_COLOR.selected);
    const items = Array.from({ length: PAUSE.maxItems }, (_, i) => {
      const t = text(18, PAUSE_COLOR.normal).setInteractive({ useHandCursor: true });
      // Maus: Überfahren wählt die Zeile, Klick löst sie aus (wie Enter)
      t.on('pointerover', () => {
        if (!this.pause.isOpen || i >= this.pause.items.length) return;
        this.pause.select(i);
        this.renderPause();
      });
      t.on('pointerdown', () => {
        if (!this.pause.isOpen || i >= this.pause.items.length) return;
        this.pause.select(i);
        this.runPauseAction(this.pause.activate());
      });
      return t;
    });
    const hint = text(16, PAUSE_COLOR.hint);
    const objects = [bg, title, ...items, hint];
    for (const o of objects) o.setScrollFactor(0).setDepth(PAUSE.depth);
    bg.setDepth(PAUSE.depth - 1);
    for (const cam of otherCams) cam.ignore(objects);
    this.pauseCam = this.cameras.add(0, 0, GAME_W, GAME_H);
    this.pauseCam.ignore(others);
    this.pauseUi = { bg, title, items, hint };
    this.renderPause();
  }

  /** Flanken der Menütasten und Gamepads in diesem Frame. Liest immer alles, damit kein alter Druck liegen bleibt. */
  private readMenuNav(): MenuNav {
    const edge = (name: NavKey): boolean => {
      const down = this.navKeys[name].isDown;
      const was = this.navPrev[name] ?? true; // erster Blick: gehaltene Taste zählt nicht
      this.navPrev[name] = down;
      return down && !was;
    };
    const up = [edge('up'), edge('w')].some(Boolean);
    const down = [edge('down'), edge('s')].some(Boolean);
    const confirm = [edge('enter'), edge('e'), edge('space')].some(Boolean);
    const nav: MenuNav = { move: up ? -1 : down ? 1 : 0, confirm, back: false, start: false };
    for (const pad of this.input.gamepad?.gamepads ?? []) {
      if (!pad || !pad.connected) continue; // abgezogene Pads bleiben in gamepads stehen
      const cur: PadNav = {
        up: pad.up || pad.leftStick.y < -STICK_THRESHOLD,
        down: pad.down || pad.leftStick.y > STICK_THRESHOLD,
        a: pad.A,
        b: pad.B,
        start: pad.buttons[PAD_START_BUTTON]?.pressed ?? false,
      };
      const prev = this.padNavPrev[pad.index];
      this.padNavPrev[pad.index] = cur;
      if (!prev) continue; // erster Blick: gehaltene Tasten nicht als Druck werten
      if (nav.move === 0) nav.move = cur.up && !prev.up ? -1 : cur.down && !prev.down ? 1 : 0;
      if (cur.a && !prev.a) nav.confirm = true;
      if (cur.b && !prev.b) nav.back = true;
      if (cur.start && !prev.start) nav.start = true;
    }
    return nav;
  }

  /** Ein Frame Esc-Menü (nur in der laufenden Runde). Gibt true zurück, wenn die Szene verlassen wurde. */
  private handlePauseInput(escPressed: boolean, nav: MenuNav): boolean {
    const p = this.pause;
    if (!p.isOpen && !escPressed && !nav.start) return false;
    // Nur eine Aktion pro Frame
    if (escPressed || nav.start) p.toggle();
    else if (nav.back) p.back();
    else if (nav.move !== 0) p.move(nav.move);
    else if (nav.confirm && this.runPauseAction(p.activate())) return true;
    this.renderPause();
    return false;
  }

  /** Führt eine Menüaktion aus. true = Szene verlassen. */
  private runPauseAction(action: PauseAction | null): boolean {
    if (action === 'toggleSound') this.cycleSound();
    if (action === 'leave') {
      // Online zuerst dem Server Bescheid geben (Platz sofort frei), dann absichtlich schließen
      this.online?.leave();
      this.leaveToMenu();
      return true;
    }
    this.renderPause();
    return false;
  }

  /** Taste M bzw. "Ton" im Esc-Menü: Musik/Effekte weiterschalten und kurz in jedem Bild anzeigen. */
  private cycleSound(): void {
    const text = audioNoticeText(cycleAudio());
    for (const slot of this.slots) this.notices.show(slot.id, text);
  }

  private closePause(): void {
    this.pause.close();
    this.renderPause();
  }

  private renderPause(): void {
    const ui = this.pauseUi;
    if (!ui) return;
    const p = this.pause;
    const open = p.isOpen;
    this.pauseCam?.setVisible(open);
    for (const o of [ui.bg, ui.title, ui.hint, ...ui.items]) o.setVisible(open);
    if (!open) return;
    const online = this.online !== null;
    const n = p.items.length;
    const itemsTop = PAUSE.pad + PAUSE.titleH;
    const height = itemsTop + n * PAUSE.rowH + PAUSE.hintGap + PAUSE.hintH + PAUSE.pad;
    const top = Math.round((GAME_H - height) / 2);
    ui.bg.setPosition(GAME_W / 2, top).setSize(PAUSE.w, height);
    ui.title.setText(pauseTitle(p.view, online)).setPosition(GAME_W / 2, top + PAUSE.pad);
    ui.items.forEach((t, i) => {
      const item = p.items[i];
      t.setVisible(item !== undefined);
      if (!item) return;
      const sel = i === p.selected;
      t.setText(`${sel ? '> ' : '  '}${pauseLabel(item, audioToggles())}`)
        .setColor(sel ? PAUSE_COLOR.selected : PAUSE_COLOR.normal)
        .setPosition(GAME_W / 2, top + itemsTop + i * PAUSE.rowH);
    });
    ui.hint
      .setText(pauseHint(p.view, online))
      .setPosition(GAME_W / 2, top + itemsTop + n * PAUSE.rowH + PAUSE.hintGap);
  }

  /** Verbindung verloren: Wiederverbindungsplan anlegen (oder direkt ins Menü, wenn kein Beitritt bekannt ist). */
  private beginReconnect(): void {
    const online = this.online;
    if (!online || this.plan) return;
    if (!online.room || !online.you || !online.token) {
      this.leaveToMenu('Verbindung zum Server verloren.');
      return;
    }
    this.plan = new ReconnectPlan();
    if (this.pause.isOpen) this.closePause(); // Esc gehört jetzt wieder dem Wiederverbindungs-Hinweis
    online.onJoined = () => {
      if (!this.plan) return;
      this.joinedSeen = true;
      this.joinedWatch = new JoinedWatch();
    };
    this.overlay?.setVisible(true);
    this.updateOverlay();
  }

  /** Absichtlich zurück ins Menü: das Schließen darf keinen neuen Wiederverbindungsplan auslösen. */
  private leaveToMenu(notice?: string): void {
    if (this.online) {
      this.online.onClosed = null;
      this.online.onStart = null;
      this.online.onError = null;
      this.online.onJoined = null;
      this.online.onPhase = null;
      this.online.close();
    }
    this.scene.start('menu', notice ? { notice } : undefined);
  }

  private updateOverlay(): void {
    const plan = this.plan;
    if (!plan || !this.overlay) return;
    this.overlay.setText(
      plan.phase === 'asking'
        ? 'Verbindung weiterhin gestört. Weiter versuchen? Enter = Ja, Esc = Menü'
        : `Verbindung verloren, verbinde neu… (${Math.ceil(plan.remainingMs() / 1000)} s)`,
    );
  }

  /** Ein Frame Wiederverbindung. Gibt true zurück, wenn die Szene verlassen wurde. */
  private tickReconnect(delta: number, menuPressed: boolean): boolean {
    const plan = this.plan;
    const online = this.online;
    if (!plan || !online) return false;
    if (menuPressed) {
      this.leaveToMenu();
      return true;
    }
    if (Phaser.Input.Keyboard.JustDown(this.enterKey) && plan.phase === 'asking') plan.continueTrying();
    if (online.status !== 'open') this.joinedWatch = null;
    // Zurück, aber die Runde ist schon vorbei und der Raum im Shop: dorthin
    if (this.joinedSeen && online.roomPhase === 'shop' && online.shop) {
      this.plan = null;
      online.onClosed = null;
      online.onError = null;
      online.onJoined = null;
      this.scene.start('shop', { online });
      return true;
    }
    if (this.joinedWatch?.update(delta)) {
      // Platz ist wieder da, aber es kam kein start: die Runde ist vorbei
      this.leaveToMenu('Die Runde ist inzwischen vorbei.');
      return true;
    }
    // Hängend: Verbindungsaufbau oder offenes Socket ohne `joined` dauert zu lange
    const waiting = online.status === 'connecting' || (online.status === 'open' && !this.joinedSeen);
    this.connectingMs = waiting ? this.connectingMs + delta : 0;
    const stalled = this.connectingMs > CONNECT_STALL_MS;
    if (plan.update(delta) === 'attempt' && (online.status === 'closed' || stalled)) {
      this.connectingMs = 0;
      this.joinedSeen = false;
      this.joinedWatch = null;
      try {
        online.reopen();
      } catch {
        // Öffnen gescheitert: der Plan zählt weiter und versucht es erneut
      }
    }
    this.updateOverlay();
    return false;
  }

  /**
   * Online, Tastatur gewählt, Auto-Wechsel an und eine Gamepad-Taste gedrückt: Steuerung auf dieses Pad
   * umstellen und speichern. Die neue Quelle wird einmal gelesen, damit der auslösende Druck keinen Kauf auslöst.
   */
  private applyAutoSwitch(): void {
    const padIndex = this.pendingPad;
    this.pendingPad = null;
    const slot = this.slots[0];
    if (!this.online || padIndex === null || !slot) return;
    const next = autoSwitchTarget(slot.device, this.autoSwitch, padIndex);
    if (!next) return;
    slot.device = next;
    saveOnlineDevice(next);
    const source = createSource(this, next);
    source.read();
    this.sources[0] = source;
    this.huds[0]?.setLabels(source.labels);
    this.notices.show(slot.id, `Steuerung: ${deviceLabel(next)}`);
  }

  /** Pads mit neuem B-Druck; beim ersten Blick auf ein Pad nur den Zustand merken (gehaltene Taste zählt nicht). */
  private padBPresses(): Set<number> {
    const pressed = new Set<number>();
    for (const pad of this.input.gamepad?.gamepads ?? []) {
      if (!pad || !pad.connected) continue; // abgezogene Pads bleiben in gamepads stehen
      const prev = this.padBPrev[pad.index];
      this.padBPrev[pad.index] = pad.B;
      if (prev !== undefined && pad.B && !prev) pressed.add(pad.index);
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
        sprite = this.add
          .sprite(npc.x, npc.y, npc.kind === 'dog' ? dogTexture('a') : policeTexture('a'))
          .setDepth(4);
        this.npcPoses.set(npc.id, initialPose(npc.x, npc.y));
        for (const ui of this.uiCams) ui.ignore(sprite); // Weltobjekt: nicht in den UI-Kameras
        this.pauseCam?.ignore(sprite); // und nicht in der Menükamera
        this.npcSprites.set(npc.id, sprite);
      }
      const nf = npcFrame(this.npcPoses.get(npc.id)!, npc.x, npc.y, delta);
      this.npcPoses.set(npc.id, nf.state);
      const dog = npc.kind === 'dog';
      const anim = dog ? dogAnim(npc, nf.moving) : policeAnim(npc, nf.moving);
      const clock = advanceClock(this.npcClocks.get(npc.id), anim, delta);
      this.npcClocks.set(npc.id, clock);
      // Bogen geladen: Bild aus der Animation, Füße auf der Position, kein Auf-und-ab (der Bogen animiert selbst).
      // Sonst die gezeichnete Figur wie bisher. Beide blicken nach rechts, flipX = nach links gegangen.
      const look = npcLook(npc, nf.moving, clock.ms, nf.frame, (key) => this.textures.exists(key));
      if (look.sheet) {
        sprite
          .setTexture(look.texture, look.frame)
          .setOrigin(0.5, look.originY)
          .setScale(dog ? 1 : POLICE_SCALE)
          .setPosition(npc.x, npc.y);
      } else {
        sprite
          .setTexture(look.texture)
          .setOrigin(0.5)
          .setScale(1)
          .setPosition(npc.x, npc.y + bobOffset(nf.state.walkMs, nf.moving));
      }
      sprite.setFlipX(nf.flipX);
      sprite.setAlpha(npc.distractedMs > 0 ? 0.5 : 1);
    }
    for (const [id, sprite] of this.npcSprites) {
      if (alive.has(id)) continue;
      sprite.destroy();
      this.npcSprites.delete(id);
      this.npcPoses.delete(id);
      this.npcClocks.delete(id);
    }
  }

  private drawMap(map: MapData): void {
    if (this.tileset === 'city') {
      // Die Stadt ist ein einziges gebackenes Bild (Boden + Details) plus eine Ebene darüber (Baumkronen, Tiefe 6).
      bakeMapLayers(this, this.mapId, map);
      this.add.image(0, 0, mapTexture(this.mapId, 'ground-below')).setOrigin(0).setDepth(0);
      if (this.textures.exists(mapTexture(this.mapId, 'above'))) {
        this.add.image(0, 0, mapTexture(this.mapId, 'above')).setOrigin(0).setDepth(6);
      }
    } else {
      for (let r = 0; r < map.rows; r++) {
        for (let c = 0; c < map.cols; c++) {
          this.add.image(c * TILE + TILE / 2, r * TILE + TILE / 2, tileTexture(this.tileset, tileKey(map, c, r))).setDepth(0);
        }
      }
    }
    for (const d of map.dropoffs) this.marker(d.x, d.y, 'dropoff', 'PFAND');
  }

  private marker(x: number, y: number, object: 'dropoff', label: string): void {
    this.add.image(x, y, objectTexture(this.tileset, object));
    this.add.text(x, y - TILE / 2, label, FONT).setOrigin(0.5, 1).setDepth(7);
  }
}
