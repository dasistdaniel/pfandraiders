import { walk } from './movement';
import { isHeldMs, MAX_HELD_MS } from './protocol';
import { cancelSearch } from './search';
import { NO_INPUT } from './types';
import type { GameState, Input } from './types';

/**
 * Nachrechnen verschluckter Bewegung (docs/NETZ.md, Befund 2).
 *
 * Der Server nimmt pro Takt nur die zuletzt angekommene Eingabe. Kommen nach einem Stau "los" und "stopp" zugleich
 * an, ginge die Bewegung dazwischen verloren, obwohl der Client sie vorhergesagt hat. Jede input-Nachricht sagt
 * deshalb in `held`, wie lange die vorige Eingabe beim Client galt. Der Server vergleicht das je Lauf (aufeinander
 * folgende Eingaben mit derselben Laufrichtung; Aktionstasten trennen keinen Lauf) mit der Zeit, die er diese
 * Richtung schon gerechnet hat, und rechnet einen Rückstand als zusätzliche Teilschritte nach.
 *
 * - Nur Bewegung. Aktionen (Suchen, Klauen, Schlagen, Sprühen ...) wirken weiter in der Reihenfolge der Ankunft.
 * - Rückstand innerhalb eines Laufs erst ab `thresholdMs` (Takt-Raster und Jitter gleichen sich sonst selbst aus);
 *   endet der Lauf (neue Richtung), zählt der ganze Rest über der Schwelle.
 * - Überlauf (der Server lief im Stau zu lange in die alte Richtung) lässt sich nicht zurücknehmen; er zählt nur
 *   gegen spätere Gutschriften desselben Laufs.
 * - Schutz gegen gefälschte Werte: ein Budget (Token-Bucket) mit `budgetMs` Fassungsvermögen, das mit der echten
 *   Zeit zwischen zwei Takten nachfüllt und von jedem Takt, in dem die Figur mit einer Laufeingabe unterwegs ist,
 *   sowie von jeder Gutschrift geleert wird. Insgesamt läuft eine Figur so nie länger als Echtzeit + budgetMs.
 * - Höchstens `perTickMs` je Takt in Teilschritten zu höchstens `substepMs` (dieselbe `walk`-Funktion mit Kollision
 *   wie im normalen Schritt); was älter als `maxAgeMs` ist, verfällt.
 *
 * Reine Klasse ohne eigene Uhr: Zeiten (ms, Server-Echtzeit) kommen vom Aufrufer, damit Server und Testsimulation
 * dieselbe Rechnung nutzen.
 */
export const MOVE_CREDIT = {
  budgetMs: MAX_HELD_MS,
  perTickMs: 100,
  substepMs: 50,
  maxAgeMs: 500,
  thresholdMs: 50,
  maxQueue: 16,
} as const;

/** Ein nachzurechnender Teilschritt: Laufrichtung und Dauer (ms). */
export interface CreditStep {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  ms: number;
}

interface Run {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  /** Summe der gemeldeten Haltedauern dieses Laufs (Client-Zeit) */
  held: number;
  /** Simulationszeit beim Beginn des Laufs */
  startSim: number;
  /** schon gutgeschrieben (zählt wie gerechnete Zeit) */
  credited: number;
}

interface Pending extends CreditStep {
  /** Nummer der Nachricht, die die Gutschrift ausgelöst hat (für das ack) */
  seq: number;
  /** Echtzeit der Gutschrift (für das Verfallen) */
  at: number;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const moves = (i: { moveX: number; moveY: number }) => i.moveX !== 0 || i.moveY !== 0;
const sameDir = (a: { moveX: number; moveY: number }, b: { moveX: number; moveY: number }) =>
  a.moveX === b.moveX && a.moveY === b.moveY;

export class MoveCredit {
  private run: Run | null = null;
  private queue: Pending[] = [];
  private budget = 0;
  /** Simulationszeit (ms): wächst je Takt um stepMs */
  private sim = 0;
  /** Echtzeit des letzten Takts; null = noch keiner */
  private lastTickAt: number | null = null;

  constructor(private readonly stepMs: number) {}

  /** Alles vergessen (neue Runde, Wiederverbindung). */
  reset(): void {
    this.run = null;
    this.queue = [];
    this.budget = 0;
  }

  /** Simulationszeit zur Echtzeit `now`: zwischen zwei Takten anteilig (höchstens ein Takt). */
  private simAt(now: number): number {
    if (this.lastTickAt === null || !finite(now)) return this.sim;
    return this.sim + Math.min(Math.max(now - this.lastTickAt, 0), this.stepMs);
  }

  private startRun(now: number, next: Input): void {
    this.run = { moveX: next.moveX, moveY: next.moveY, held: 0, startSim: this.simAt(now), credited: 0 };
  }

  /**
   * Eine input-Nachricht ist angekommen (vor dem Überschreiben der Eingabe): `held` = gemeldete Haltedauer der
   * vorigen Eingabe `prev` (undefined = alter Client), `next` = die neue Eingabe.
   */
  onInput(now: number, seq: number, held: number | undefined, prev: Input, next: Input): void {
    if (!finite(now) || held === undefined || !isHeldMs(held)) {
      // ohne (gültige) Haltedauer weiß der Server nicht, wie lange die vorige Eingabe galt: neu anfangen
      this.startRun(now, next);
      return;
    }
    const run = this.run;
    if (run && sameDir(run, prev)) {
      run.held += held;
      const deficit = run.held - (this.simAt(now) - run.startSim + run.credited);
      const ends = !sameDir(run, next);
      const t = MOVE_CREDIT.thresholdMs;
      const grant = ends ? (deficit > t ? deficit : 0) : deficit - t;
      if (grant > 0 && moves(run)) {
        const ms = Math.min(grant, MAX_HELD_MS);
        this.enqueue({ moveX: run.moveX, moveY: run.moveY, ms, seq, at: now });
        run.credited += ms;
      }
      if (!ends) return;
    }
    this.startRun(now, next);
  }

  private enqueue(p: Pending): void {
    this.queue.push(p);
    if (this.queue.length > MOVE_CREDIT.maxQueue) this.queue.splice(0, this.queue.length - MOVE_CREDIT.maxQueue);
    // insgesamt nie mehr als MAX_HELD_MS in der Warteschlange: die ältesten Einträge kürzen
    let sum = this.queue.reduce((a, q) => a + q.ms, 0);
    while (sum > MAX_HELD_MS && this.queue.length > 0) {
      const cut = Math.min(this.queue[0].ms, sum - MAX_HELD_MS);
      this.queue[0].ms -= cut;
      sum -= cut;
      if (this.queue[0].ms <= 0) this.queue.shift();
    }
  }

  /**
   * Ein Server-Takt zur Echtzeit `now`, vor dem normalen Schritt. `canMove` = die Figur kann laufen (kein Countdown,
   * nicht bewusstlos, Runde läuft), `moving` = die aktuelle Eingabe ist eine Laufeingabe. Gibt die Teilschritte
   * zurück, die vor dem normalen Schritt nachzurechnen sind (in dieser Reihenfolge).
   */
  tick(now: number, canMove: boolean, moving: boolean): CreditStep[] {
    if (!finite(now)) return [];
    const cap = MOVE_CREDIT.budgetMs;
    if (this.lastTickAt !== null) this.budget = Math.min(cap, this.budget + Math.max(0, now - this.lastTickAt));
    this.lastTickAt = now;
    this.sim += this.stepMs;
    if (!canMove) {
      // Countdown oder bewusstlos: der Client sagt keine Bewegung vorher, also auch nichts nachrechnen
      this.queue = [];
      this.run = null;
      return [];
    }
    // der normale Schritt kostet, wenn die Figur mit einer Laufeingabe unterwegs ist (nicht unter -cap, damit
    // ein kurzer Takt-Stau des Servers nicht ewig nachwirkt)
    if (moving) this.budget = Math.max(-cap, this.budget - this.stepMs);
    this.queue = this.queue.filter((q) => now - q.at <= MOVE_CREDIT.maxAgeMs);
    const steps: CreditStep[] = [];
    let left = MOVE_CREDIT.perTickMs;
    while (this.queue.length > 0 && left > 0 && this.budget > 0) {
      const q = this.queue[0];
      const ms = Math.min(q.ms, left, this.budget, MOVE_CREDIT.substepMs);
      steps.push({ moveX: q.moveX, moveY: q.moveY, ms });
      q.ms -= ms;
      left -= ms;
      this.budget -= ms;
      if (q.ms <= 1e-9) this.queue.shift();
    }
    return steps;
  }

  /** Höchste Eingabenummer, die der Snapshot bestätigen darf: nicht über eine noch offene Gutschrift hinaus. */
  ackLimit(ack: number): number {
    return this.queue.length > 0 ? Math.min(ack, this.queue[0].seq - 1) : ack;
  }
}

/** Kann die Figur gerade laufen? (Runde läuft, kein Countdown, nicht bewusstlos) */
export function canWalk(state: GameState, id: string): boolean {
  const p = state.players[id];
  return state.phase === 'running' && state.countdownMs <= 0 && !!p && p.unconsciousMs <= 0 && p.mode !== 'unconscious';
}

/** Rechnet Teilschritte für einen Spieler nach: dieselbe `walk`-Funktion wie step(), eine Suche bricht ab. */
export function applyCreditSteps(state: GameState, id: string, steps: readonly CreditStep[]): void {
  const p = state.players[id];
  if (!p) return;
  for (const s of steps) {
    if (!moves(s) || !(s.ms > 0)) continue;
    cancelSearch(p);
    walk(state.map, p, { ...NO_INPUT, moveX: s.moveX, moveY: s.moveY }, s.ms);
  }
}
