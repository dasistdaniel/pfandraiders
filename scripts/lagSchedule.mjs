// Planung des Lag-Proxys (scripts/lag-proxy.mjs): wann ein WebSocket-Frame weitergereicht wird.
// Reines Modul ohne Netz; Zufall und Uhr werden übergeben (Tests: packages/server/test/lagSchedule.test.mjs).

/** So lange hält ein "verlorenes" Segment alles dahinter auf (ms), wie eine TCP-Neusendung. */
export const LOSS_STALL_MS = 200;

/**
 * Voreinstellungen. delay = feste Verzögerung (ms), jitter = gleichverteilt ±jitter (ms), burstEvery/burstMs =
 * alle burstEvery ms ein Stau von burstMs (alles wird gehalten und am Ende auf einmal losgelassen),
 * lossStall = Chance je Frame für einen Neusendungs-Stau von LOSS_STALL_MS.
 */
export const PRESETS = {
  wifi: { delay: 20, jitter: 15, burstEvery: 0, burstMs: 0, lossStall: 0 },
  congested: { delay: 80, jitter: 40, burstEvery: 5000, burstMs: 250, lossStall: 0.005 },
  steam: { delay: 60, jitter: 80, burstEvery: 2500, burstMs: 400, lossStall: 0 },
};

const DEFAULTS = { listen: 8081, target: 'ws://localhost:8080', delay: 0, jitter: 0, burstEvery: 0, burstMs: 0, lossStall: 0, stallDir: 'both' };

/** Richtungen, in denen Staus (burst und loss-stall) wirken: beide, nur Server->Client (down) oder nur Client->Server (up) */
export const STALL_DIRS = ['both', 'down', 'up'];

/** Optionen einer Richtung ('up' = Client->Server, 'down' = Server->Client): ohne Staus, wenn sie nicht gemeint ist. */
export function lineOptions(opts, dir) {
  if (opts.stallDir === 'both' || opts.stallDir === dir) return opts;
  return { ...opts, burstEvery: 0, burstMs: 0, lossStall: 0 };
}

const FLAGS = {
  '--listen': 'listen',
  '--target': 'target',
  '--delay': 'delay',
  '--jitter': 'jitter',
  '--burst-every': 'burstEvery',
  '--burst-ms': 'burstMs',
  '--loss-stall': 'lossStall',
  '--preset': 'preset',
  '--stall-dir': 'stallDir',
};

/** Kommandozeile lesen. Einzelne Angaben gehen vor der Voreinstellung, egal in welcher Reihenfolge. */
export function parseArgs(argv) {
  const given = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const key = FLAGS[flag];
    if (!key) throw new Error(`Unbekannte Option ${flag}`);
    const value = argv[++i];
    if (value === undefined) throw new Error(`${flag} braucht einen Wert`);
    if (key === 'stallDir' && !STALL_DIRS.includes(value)) throw new Error(`--stall-dir muss ${STALL_DIRS.join('|')} sein: ${value}`);
    if (key === 'target' || key === 'preset' || key === 'stallDir') {
      given[key] = value;
      continue;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${flag} muss eine Zahl >= 0 sein: ${value}`);
    if (key === 'lossStall' && n > 1) throw new Error(`--loss-stall ist eine Wahrscheinlichkeit (0..1): ${value}`);
    if (key === 'listen' && !Number.isInteger(n)) throw new Error(`--listen muss ein Port sein: ${value}`);
    given[key] = n;
  }
  const preset = given.preset ?? null;
  if (preset !== null && !Object.hasOwn(PRESETS, preset)) {
    throw new Error(`Unbekannte Voreinstellung ${preset} (${Object.keys(PRESETS).join(', ')})`);
  }
  const { preset: _p, ...rest } = given;
  return { ...DEFAULTS, ...(preset ? PRESETS[preset] : {}), ...rest, preset };
}

/**
 * Eine Richtung der Leitung. due(now) sagt, wann ein jetzt angekommener Frame weitergeht.
 * Wie TCP wird nie umsortiert: Kein Frame geht vor seinem Vorgänger.
 */
export class LagLine {
  /** @param {{delay:number,jitter:number,burstEvery:number,burstMs:number,lossStall:number}} opts */
  constructor(opts, rand = Math.random, start = 0) {
    this.opts = opts;
    this.rand = rand;
    this.start = start;
    this.last = -Infinity;
    /** der letzte Frame wurde von einem Stau gehalten */
    this.lastHeld = false;
  }

  /** Ende des Staus, in dem t liegt, sonst null. */
  stallEnd(t) {
    const { burstEvery, burstMs } = this.opts;
    if (!(burstEvery > 0) || !(burstMs > 0) || t < this.start + burstEvery) return null;
    const k = Math.floor((t - this.start) / burstEvery);
    const begin = this.start + k * burstEvery;
    return t < begin + burstMs ? begin + burstMs : null;
  }

  inStall(t) {
    return this.stallEnd(t) !== null;
  }

  due(now) {
    const { delay, jitter, lossStall } = this.opts;
    const r = this.rand();
    let due = Math.max(now, now + delay + (r * 2 - 1) * jitter);
    let held = false;
    if (lossStall > 0 && this.rand() < lossStall) {
      due = Math.max(due, now + delay + LOSS_STALL_MS);
      held = true;
    }
    const end = this.stallEnd(due);
    if (end !== null) {
      due = end;
      held = true;
    }
    if (due < this.last) {
      due = this.last;
      held = held || this.lastHeld;
    }
    this.last = due;
    this.lastHeld = held;
    return due;
  }
}

/**
 * Warteschlange einer Richtung: hält Frames bis zu ihrer Zeit und gibt sie in Ankunftsreihenfolge an `send`.
 * `timers` = { now, setTimeout, clearTimeout } (Tests: falsche Uhr).
 */
export class OrderedQueue {
  constructor(line, send, timers = { now: () => Date.now(), setTimeout, clearTimeout }) {
    this.line = line;
    this.send = send;
    this.timers = timers;
    this.queue = [];
    this.timer = null;
    this.disposed = false;
    this.stats = { frames: 0, bytes: 0, delaySum: 0, maxDelay: 0, held: 0 };
  }

  /** `size` = Bytes für die Zusammenfassung (Standard: Länge von `data`). */
  push(data, size = data?.length ?? 0) {
    if (this.disposed) return;
    const now = this.timers.now();
    const due = this.line.due(now);
    const delay = due - now;
    const s = this.stats;
    s.frames++;
    s.bytes += size;
    s.delaySum += delay;
    s.maxDelay = Math.max(s.maxDelay, delay);
    if (this.line.lastHeld) s.held++;
    this.queue.push({ due, data });
    this.arm();
  }

  arm() {
    if (this.timer !== null || this.queue.length === 0 || this.disposed) return;
    const wait = Math.max(0, this.queue[0].due - this.timers.now());
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, wait);
  }

  flush() {
    if (this.disposed) return;
    const now = this.timers.now();
    while (this.queue.length > 0 && this.queue[0].due <= now) this.send(this.queue.shift().data);
    this.arm();
  }

  /** Zähler seit dem letzten Aufruf (für die Zusammenfassung alle 5 s). */
  takeStats() {
    const s = this.stats;
    this.stats = { frames: 0, bytes: 0, delaySum: 0, maxDelay: 0, held: 0 };
    return s;
  }

  get pending() {
    return this.queue.length;
  }

  dispose() {
    this.disposed = true;
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
    this.queue = [];
  }
}
