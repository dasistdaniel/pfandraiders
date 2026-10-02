import { step } from '@pfandraiders/core';
import type { GameState, Input } from '@pfandraiders/core';

/** Fester Simulationsschritt im lokalen Modus */
export const LOCAL_STEP_MS = 16;
/** Größter Zeitsprung, den ein Frame nachholt (Tab im Hintergrund, Lag) */
const MAX_FRAME_MS = 250;

/** Schnittstelle zwischen Darstellung und Spielkern. Online kommt in Phase 4 dazu. */
export interface GameConnection {
  readonly localPlayerIds: string[];
  setInput(playerId: string, input: Input): void;
  update(deltaMs: number): void;
  getState(): GameState;
}

export class LocalConnection implements GameConnection {
  private inputs: Record<string, Input> = {};
  private accumulator = 0;

  constructor(
    private readonly state: GameState,
    readonly localPlayerIds: string[],
  ) {}

  setInput(playerId: string, input: Input): void {
    // Ein noch nicht verarbeiteter Kaufbefehl geht nicht durch einen Frame ohne Schritt verloren.
    const pendingBuy = this.inputs[playerId]?.buy ?? null;
    this.inputs[playerId] = { ...input, buy: input.buy ?? pendingBuy };
  }

  update(deltaMs: number): void {
    this.accumulator += Math.min(deltaMs, MAX_FRAME_MS);
    while (this.accumulator >= LOCAL_STEP_MS) {
      step(this.state, this.inputs, LOCAL_STEP_MS);
      this.accumulator -= LOCAL_STEP_MS;
      // Einmalige Befehle sind verbraucht
      for (const id of Object.keys(this.inputs)) {
        this.inputs[id] = { ...this.inputs[id], buy: null };
      }
    }
  }

  getState(): GameState {
    return this.state;
  }
}
