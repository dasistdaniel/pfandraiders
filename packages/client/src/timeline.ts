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
export const MIN_WINDOW_MS = 1500;
/** So lange werden Ankünfte für die Schätzung des Server-Takts gemerkt (ms) */
export const RATE_WINDOW_MS = 8000;
/** Erst ab so viel Zeitspanne im Fenster wird der Takt geschätzt (ms) */
export const RATE_MIN_SPAN_MS = 1000;
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
   * Snapshot mit `tick` ist zur Client-Zeit `at` angekommen. Gibt seine Verspätung gegenüber der Zeitachse zurück
   * (ms; bei schneller Leitung um 0, im Stau groß).
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
    this.target = this.envelope(newest);
    // Mit der ersten Takt-Schätzung direkt auf die Hülle: die alte Zuordnung (50 ms je Tick) war geraten
    if (first || Math.abs(this.target - this.base) > RESYNC_MS) this.base = this.target;
    return at - this.timeOf(tick);
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

  /** Minimum von (Ankunft - Tick-Zeit) der letzten MIN_WINDOW_MS, bezogen auf `baseTick`. */
  private envelope(newest: number): number {
    let min = Number.POSITIVE_INFINITY;
    for (const s of this.samples) {
      if (s.at < newest - MIN_WINDOW_MS) continue;
      min = Math.min(min, s.at - (s.tick - this.baseTick) * this.msPerTick);
    }
    return min;
  }

  /**
   * Takt aus der unteren Hülle: in der älteren und der neueren Hälfte des Fensters je den Snapshot mit der
   * kleinsten Verspätung suchen; die Steigung zwischen beiden ist die Dauer eines Ticks. Staus und Jitter
   * verspäten Snapshots nur, die schnellsten bleiben brauchbar. Gibt true bei der ersten Schätzung zurück.
   */
  private estimateRate(): boolean {
    const s = this.samples;
    if (s.length < 4) return false;
    const first = s[0].at;
    const span = s[s.length - 1].at - first;
    if (span < RATE_MIN_SPAN_MS) return false;
    const mid = first + span / 2;
    let a: Sample | null = null;
    let b: Sample | null = null;
    let av = Number.POSITIVE_INFINITY;
    let bv = Number.POSITIVE_INFINITY;
    for (const x of s) {
      const v = x.at - (x.tick - this.baseTick) * this.msPerTick;
      if (x.at < mid) {
        if (v < av) {
          av = v;
          a = x;
        }
      } else if (v < bv) {
        bv = v;
        b = x;
      }
    }
    if (!a || !b || b.tick - a.tick < 10) return false;
    const raw = Math.max(RATE_MIN, Math.min(RATE_MAX, (b.at - a.at) / (b.tick - a.tick)));
    if (!this.rateKnown) {
      this.rateKnown = true;
      this.msPerTick = raw;
      return true;
    }
    this.msPerTick += RATE_GAIN * (raw - this.msPerTick);
    return false;
  }
}
