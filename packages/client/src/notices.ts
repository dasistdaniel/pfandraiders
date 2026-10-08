/** So lange steht ein kurzer Hinweis (etwa "3 Flaschen beschlagnahmt!") im HUD. */
export const NOTICE_MS = 3000;

/** Kurze Hinweise je Spieler, die nach einer festen Zeit verschwinden. Rein, ohne Phaser. */
export class Notices {
  private readonly items = new Map<string, { text: string; ms: number }>();

  /** Zeigt `text` für `ms` Millisekunden; ein älterer Hinweis desselben Spielers wird ersetzt. */
  show(id: string, text: string, ms: number = NOTICE_MS): void {
    this.items.set(id, { text, ms });
  }

  tick(deltaMs: number): void {
    if (!(deltaMs > 0)) return;
    for (const [id, n] of this.items) {
      n.ms -= deltaMs;
      if (n.ms <= 0) this.items.delete(id);
    }
  }

  lines(id: string): string[] {
    const n = this.items.get(id);
    return n ? [n.text] : [];
  }
}
