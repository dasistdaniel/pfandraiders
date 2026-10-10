import { SERVER_STEP_MS } from './prediction';

/**
 * Zeitachse des Servers für fremde Figuren (docs/NETZ.md, Befund 3).
 *
 * Jeder Snapshot trägt seinen Server-Tick. Statt ihn bei seiner Ankunft einzuordnen (nach einem Stau kämen dann
 * mehrere Ticks auf fast dieselbe Zeit), legt die Zeitachse jeden Tick dorthin, wo er bei schneller Leitung
 * angekommen wäre: Client-Zeit = base + (tick - baseTick) * msPerTick.
 *
 * - `base` folgt der unteren Hülle der Ankünfte: dem Minimum von (Ankunft - Tick-Zeit) über ein gleitendes Fenster.
 *   Verspätete Snapshots (Jitter, Stau) verschieben sie nicht; der Unterschied ist ihre Verspätung.
 * - `msPerTick` wird geschätzt. Der Server tickt pro setInterval-Aufruf einmal; unter Windows liegt das Raster bei
 *   etwa 61 statt 50 ms. Mit fest 50 ms liefe die Zeitachse dem Server davon.
 * - Änderungen der Hülle werden langsam übernommen (höchstens OFFSET_SLEW ms je ms), damit fremde Figuren nicht
 *   springen, sondern höchstens kurz etwas schneller oder langsamer laufen. Nur bei mehr als RESYNC_MS Abstand
 *   (Uhr hing, neue Verbindung) springt sie.
 *
 * Reines Modul: alle Zeiten werden übergeben (im Spiel die Uhr von OnlineConnection, in Tests eine falsche).
 */

/** Fenster für das Minimum der Ankünfte (ms Client-Zeit) */
export const MIN_WINDOW_MS = 1000;
/**
 * Fenster für die Verspätung (ms): gemessen gegen das Minimum der letzten LATE_WINDOW_MS, nicht gegen die
 * geglättete Zeitachse. So zählen ein schwankender Server-Takt (Windows: 53 bis 61 ms je Tick) und Fehler der
 * Takt-Schätzung kaum als Jitter. Kürzere Staus zeigen sich als Verspätung der gehaltenen Ticks; längere sieht
 * der DelayController über die offene Lücke.
 */
export const LATE_WINDOW_MS = 300;
/** So lange werden Ankünfte für die Schätzung des Server-Takts gemerkt (ms) */
export const RATE_WINDOW_MS = 3000;
/** Erst ab so viel Zeitspanne im Fenster wird der Takt geschätzt (ms) */
export const RATE_MIN_SPAN_MS = 1200;
/** Stücke des Fensters, aus denen je der schnellste Snapshot in die Takt-Schätzung eingeht (ms) */
export const RATE_BUCKET_MS = 400;
/** Gewicht einer neuen Takt-Schätzung je Snapshot */
export const RATE_GAIN = 0.2;
/** Grenzen der Takt-Schätzung (ms je Tick) */
export const RATE_MIN = 35;
export const RATE_MAX = 100;
/** Höchste Verschiebung der Zeitachse je ms Client-Zeit (0,05 = Anzeige läuft 5 % schneller oder langsamer) */
export const OFFSET_SLEW = 0.05;
/** Weiter daneben springt die Zeitachse direkt auf die Hülle (ms) */
export const RESYNC_MS = 300;

interface Sample {
  tick: number;
  at: number;
}

export class ServerTimeline {
  /** geschätzte Dauer eines Server-Ticks in Client-Zeit (ms) */
  msPerTick = SERVER_STEP_MS;
  private samples: Sample[] = [];
  /** Bezugspunkt: Tick `baseTick` liegt bei Client-Zeit `base` (geglättet) */
  private baseTick = 0;
  private base = 0;
  /** Hülle der Ankünfte für `baseTick` (Ziel von `base`) */
  private target = 0;
  private hasBase = false;
  private lastNow: number | null = null;
  /** Takt schon einmal geschätzt (ab RATE_MIN_SPAN_MS Daten) */
  private rateKnown = false;

  /** Schon ein Snapshot gesehen? Vorher ist die Zuordnung undefiniert. */
  get ready(): boolean {
    return this.hasBase;
  }

  /**
   * Takt geschätzt? Vorher rechnet die Zeitachse mit 50 ms je Tick; läuft der Server langsamer, wirken die
   * Snapshots bis dahin immer verspäteter. Verspätungen zählen deshalb erst danach als Jitter.
   */
  get settled(): boolean {
    return this.rateKnown;
  }

  reset(): void {
    this.rateKnown = false;
    this.msPerTick = SERVER_STEP_MS;
    this.samples = [];
    this.baseTick = 0;
    this.base = 0;
    this.target = 0;
    this.hasBase = false;
    this.lastNow = null;
  }

  /** Client-Zeit, zu der dieser Tick bei schneller Leitung angekommen wäre. */
  timeOf(tick: number): number {
    return this.base + (tick - this.baseTick) * this.msPerTick;
  }

  /** Tick (mit Bruchteil), der zu dieser Client-Zeit gehört. */
  tickAt(time: number): number {
    return this.baseTick + (time - this.base) / this.msPerTick;
  }

  /**
   * Snapshot mit `tick` ist zur Client-Zeit `at` angekommen. Gibt seine Verspätung zurück (ms; bei schneller
   * Leitung um 0, im Stau groß), gemessen gegen die Ankünfte der letzten LATE_WINDOW_MS.
   */
  noteSnapshot(tick: number, at: number): number {
    if (!Number.isFinite(tick) || !Number.isFinite(at)) return 0;
    if (!this.hasBase) {
      this.hasBase = true;
      this.baseTick = tick;
      this.base = at;
      this.target = at;
      this.samples.push({ tick, at });
      return 0;
    }
    // Bezugspunkt auf den neuesten Tick legen (ändert die Zuordnung nicht)
    if (tick > this.baseTick) {
      const d = (tick - this.baseTick) * this.msPerTick;
      this.base += d;
      this.target += d;
      this.baseTick = tick;
    }
    this.samples.push({ tick, at });
    const newest = this.samples[this.samples.length - 1].at;
    let drop = 0;
    while (drop < this.samples.length - 1 && this.samples[drop].at < newest - RATE_WINDOW_MS) drop++;
    if (drop > 0) this.samples.splice(0, drop);
    const first = this.estimateRate();
    this.target = this.envelope(newest, MIN_WINDOW_MS);
    // Mit der ersten Takt-Schätzung direkt auf die Hülle: die alte Zuordnung (50 ms je Tick) war geraten
    if (first || Math.abs(this.target - this.base) > RESYNC_MS) this.base = this.target;
    return at - (this.envelope(newest, LATE_WINDOW_MS) + (tick - this.baseTick) * this.msPerTick);
  }

  /** Ein Frame zur Client-Zeit `now`: die Zeitachse rückt langsam an die Hülle heran. */
  advance(now: number): void {
    if (!Number.isFinite(now)) return;
    const dt = this.lastNow === null ? 0 : Math.max(0, now - this.lastNow);
    this.lastNow = now;
    if (!this.hasBase) return;
    const diff = this.target - this.base;
    if (Math.abs(diff) > RESYNC_MS) {
      this.base = this.target;
      return;
    }
    const step = OFFSET_SLEW * dt;
    this.base += Math.max(-step, Math.min(step, diff));
  }

  /** Minimum von (Ankunft - Tick-Zeit) der letzten `windowMs`, bezogen auf `baseTick`. */
  private envelope(newest: number, windowMs: number): number {
    let min = Number.POSITIVE_INFINITY;
    for (const s of this.samples) {
      if (s.at < newest - windowMs) continue;
      min = Math.min(min, s.at - (s.tick - this.baseTick) * this.msPerTick);
    }
    return min;
  }

  /**
   * Takt aus der unteren Hülle: das Fenster in Stücke von RATE_BUCKET_MS teilen, je Stück den Snapshot mit der
   * kleinsten Verspätung nehmen und durch diese Punkte eine Gerade legen (kleinste Quadrate); ihre Steigung ist
   * die Dauer eines Ticks. Staus und Jitter verspäten Snapshots nur, die schnellsten bleiben brauchbar. Ändert sich
   * der Takt, ziehen die neuen Stücke die Gerade mit. Gibt true bei der ersten Schätzung zurück.
   */
  private estimateRate(): boolean {
    const s = this.samples;
    if (s.length < 4) return false;
    const first = s[0].at;
    const span = s[s.length - 1].at - first;
    if (span < RATE_MIN_SPAN_MS) return false;
    // Das jüngste Stück ist noch nicht fertig (ein Stau-Schwall käme dort nur halb an) und zählt nicht mit
    const open = Math.floor(span / RATE_BUCKET_MS);
    const best = new Map<number, { x: Sample; v: number }>();
    for (const x of s) {
      const bucket = Math.floor((x.at - first) / RATE_BUCKET_MS);
      if (bucket >= open) continue;
      const v = x.at - (x.tick - this.baseTick) * this.msPerTick;
      const cur = best.get(bucket);
      if (!cur || v < cur.v) best.set(bucket, { x, v });
    }
    const pts = [...best.values()].map((b) => b.x);
    if (pts.length < 3 || pts[pts.length - 1].tick - pts[0].tick < 10) return false;
    // Gerade at = c + Steigung · tick (Ticks relativ zum Bezugspunkt, damit die Zahlen klein bleiben)
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + (p.tick - this.baseTick), 0) / n;
    const my = pts.reduce((a, p) => a + p.at, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (const p of pts) {
      const dx = p.tick - this.baseTick - mx;
      sxy += dx * (p.at - my);
      sxx += dx * dx;
    }
    if (!(sxx > 0)) return false;
    const raw = Math.max(RATE_MIN, Math.min(RATE_MAX, sxy / sxx));
    if (!this.rateKnown) {
      this.rateKnown = true;
      this.msPerTick = raw;
      return true;
    }
    this.msPerTick += RATE_GAIN * (raw - this.msPerTick);
    return false;
  }
}
