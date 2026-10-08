import { step } from '@pfandraiders/core';
import type { GameState, Input } from '@pfandraiders/core';

/** Fester Simulationsschritt im lokalen Modus */
export const LOCAL_STEP_MS = 16;
/** Größter Zeitsprung, den ein Frame nachholt (Tab im Hintergrund, Lag) */
const MAX_FRAME_MS = 250;

/** Schnittstelle zwischen Darstellung und Spielkern. Lokal: LocalConnection, online: OnlineConnection. */
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
    this.inputs[playerId] = { ...input };
  }

  update(deltaMs: number): void {
    this.accumulator += Math.min(deltaMs, MAX_FRAME_MS);
    while (this.accumulator >= LOCAL_STEP_MS) {
      step(this.state, this.inputs, LOCAL_STEP_MS);
      this.accumulator -= LOCAL_STEP_MS;
    }
  }

  getState(): GameState {
    return this.state;
  }
}
