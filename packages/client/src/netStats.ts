/**
 * Netz-Diagnose im Online-Spiel (Overlay mit ?debug=net oder F3, siehe docs/NETZ.md).
 *
 * Reines Modul ohne Phaser und DOM: Die Uhr wird übergeben (im Spiel performance.now(), in Tests eine falsche),
 * damit Rundreise, Lücken und Jitter in echter Zeit gemessen werden, nicht in der Spieluhr von OnlineConnection
 * (die nur pro Frame und höchstens 250 ms weiterläuft). Ist die Diagnose aus, gibt es gar kein NetStats-Objekt.
 */

/** Fenster für Lücken, Jitter, Frame-Zeit und Korrekturen (ms) */
export const WINDOW_MS = 5000;
/** Fenster für harte Sprünge (ms) */
export const SNAP_WINDOW_MS = 30000;
/** Fenster für Snapshots pro Sekunde (ms) */
export const RATE_WINDOW_MS = 1000;
/** Gewicht eines neuen RTT-Werts im geglätteten Mittel (wie TCP: 1/8) */
export const RTT_GAIN = 1 / 8;
/** So viele Sendezeitpunkte werden gemerkt */
const MAX_SENDS = 128;

export interface NetStatsView {
  /** geglättete Rundreise Eingabe -> Snapshot mit diesem ack (ms); null = noch keine */
  rttMs: number | null;
  /** letzte gemessene Rundreise (ms) */
  rttLastMs: number | null;
  /** Standardabweichung der Abstände zwischen Snapshots im Fenster (ms); null = zu wenige */
  jitterMs: number | null;
  /** angekommene Snapshots in der letzten Sekunde */
  snapsPerSec: number;
  /** größter Abstand zwischen zwei Snapshots im Fenster, auch die gerade offene Lücke (ms); null = noch keiner */
  maxGapMs: number | null;
  /** längster Frame im Fenster (ms) */
  frameMaxMs: number;
  /** Korrekturen der Vorhersage pro Sekunde (Mittel über das Fenster) */
  correctionsPerSec: number;
  /** harte Sprünge der eigenen Figur (SNAP_DIST) in den letzten 30 s */
  hardSnaps: number;
}

/** Werte aus OnlineConnection und Predictor, die NetStats nicht selbst zählt */
export interface NetExtra {
  /** Snapshots im Puffer (wird erst bei 32 gekürzt) */
  buffered: number;
  /** davon neuer als die Anzeigezeit (Vorrat für die Interpolation fremder Figuren) */
  ahead: number;
  /** noch nicht angezeigter Teil der Korrekturen (px) */
  offsetPx: number;
  /** Abweichung Server zu Vorhersage beim letzten Snapshot (px) */
  errorPx: number;
}

interface Stamp {
  t: number;
  v: number;
}

/** Entfernt Einträge vor `from` (alle Listen sind nach Zeit sortiert). */
function prune(list: Stamp[], from: number): void {
  let i = 0;
  while (i < list.length && list[i].t <= from) i++;
  if (i > 0) list.splice(0, i);
}

export class NetStats {
  private readonly sends = new Map<number, number>();
  /** höchstes schon beantwortetes seq */
  private acked = -1;
  private rtt: number | null = null;
  private rttLast: number | null = null;
  private lastArrival: number | null = null;
  /** Ankünfte (v unbenutzt) */
  private arrivals: Stamp[] = [];
  /** Abstände zwischen Snapshots, Zeit = Ankunft des zweiten */
  private gaps: Stamp[] = [];
  private frames: Stamp[] = [];
  private corrections: Stamp[] = [];
  private snaps: Stamp[] = [];
  private baseline: { corrections: number; snaps: number } | null = null;

  constructor(private readonly now: () => number) {}

  /** Eingabe `seq` geht hinaus. */
  noteSent(seq: number): void {
    if (!Number.isSafeInteger(seq)) return;
    this.sends.set(seq, this.now());
    while (this.sends.size > MAX_SENDS) this.sends.delete(this.sends.keys().next().value as number);
  }

  /** Snapshot angekommen, `ack` = höchste Eingabe, die der Server bis dahin hatte. */
  noteSnapshot(ack: number): void {
    const t = this.now();
    if (Number.isSafeInteger(ack) && ack > this.acked) {
      // Rundreise der neuesten jetzt bestätigten Eingabe
      let newest = -1;
      for (const seq of this.sends.keys()) if (seq <= ack && seq > this.acked && seq > newest) newest = seq;
      this.acked = ack;
      if (newest >= 0) {
        const sample = t - this.sends.get(newest)!;
        this.rttLast = sample;
        this.rtt = this.rtt === null ? sample : this.rtt + RTT_GAIN * (sample - this.rtt);
      }
      for (const seq of [...this.sends.keys()]) if (seq <= ack) this.sends.delete(seq);
    }
    if (this.lastArrival !== null) this.gaps.push({ t, v: t - this.lastArrival });
    this.lastArrival = t;
    this.arrivals.push({ t, v: 0 });
    this.trim(t);
  }

  /** Ein Frame mit der Dauer `dtMs` (ungekürzt, wie Phaser ihn meldet). */
  noteFrame(dtMs: number): void {
    if (!Number.isFinite(dtMs)) return;
    const t = this.now();
    this.frames.push({ t, v: dtMs });
    this.trim(t);
  }

  /** Stand der Zähler des Predictors (fortlaufend); gezählt wird, was seit dem letzten Aufruf dazukam. */
  notePrediction(corrections: number, snaps: number): void {
    const base = this.baseline;
    this.baseline = { corrections, snaps };
    if (!base || corrections < base.corrections || snaps < base.snaps) return; // neuer Predictor: neuer Ausgangsstand
    const t = this.now();
    if (corrections > base.corrections) this.corrections.push({ t, v: corrections - base.corrections });
    if (snaps > base.snaps) this.snaps.push({ t, v: snaps - base.snaps });
    this.trim(t);
  }

  private trim(t: number): void {
    prune(this.arrivals, t - RATE_WINDOW_MS);
    prune(this.gaps, t - WINDOW_MS);
    prune(this.frames, t - WINDOW_MS);
    prune(this.corrections, t - WINDOW_MS);
    prune(this.snaps, t - SNAP_WINDOW_MS);
  }

  view(): NetStatsView {
    const t = this.now();
    this.trim(t);
    let jitter: number | null = null;
    if (this.gaps.length >= 2) {
      const mean = this.gaps.reduce((a, g) => a + g.v, 0) / this.gaps.length;
      jitter = Math.sqrt(this.gaps.reduce((a, g) => a + (g.v - mean) ** 2, 0) / this.gaps.length);
    }
    let maxGap: number | null = null;
    if (this.lastArrival !== null) {
      maxGap = t - this.lastArrival;
      for (const g of this.gaps) maxGap = Math.max(maxGap, g.v);
    }
    return {
      rttMs: this.rtt,
      rttLastMs: this.rttLast,
      jitterMs: jitter,
      snapsPerSec: this.arrivals.length,
      maxGapMs: maxGap,
      frameMaxMs: this.frames.reduce((m, f) => Math.max(m, f.v), 0),
      correctionsPerSec: this.corrections.reduce((a, c) => a + c.v, 0) / (WINDOW_MS / 1000),
      hardSnaps: this.snaps.reduce((a, c) => a + c.v, 0),
    };
  }
}

/** Overlay an mit ?debug=net (auch in einer Liste: ?debug=foo,net). */
export function isNetDebug(search: string): boolean {
  return new URLSearchParams(search)
    .getAll('debug')
    .some((v) => v.split(',').map((s) => s.trim()).includes('net'));
}

const int = (n: number | null): string => (n === null ? '-' : String(Math.round(n))).padStart(5);
const dec = (n: number): string => n.toFixed(1).padStart(5);

/** Zeilen des Overlays (Monospace, höchstens 22 Zeichen breit). */
export function formatNetStats(v: NetStatsView, x: NetExtra): string[] {
  return [
    'NETZ (F3)',
    `RTT   ${int(v.rttMs)} ms${v.rttLastMs === null ? '' : ` (${Math.round(v.rttLastMs)})`}`,
    `Jitter${int(v.jitterMs)} ms`,
    `Snaps ${int(v.snapsPerSec)} /s`,
    `Lücke ${int(v.maxGapMs)} ms max 5s`,
    `Puffer${int(x.buffered)} (vor ${x.ahead})`,
    `Frame ${int(v.frameMaxMs)} ms max 5s`,
    `Korr  ${dec(v.correctionsPerSec)} /s`,
    `Sprung${int(v.hardSnaps)} in 30s`,
    `Fehler${dec(x.errorPx)} px`,
    `Glätt ${dec(x.offsetPx)} px`,
  ];
}
