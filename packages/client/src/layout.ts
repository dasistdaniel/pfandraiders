export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Logische Spielfläche in Pixeln. Phaser skaliert sie auf das Fenster. */
export const GAME_W = 480;
export const GAME_H = 270;

/**
 * Aufteilung des Bildes für 1 bis 4 Spieler. `gap` Pixel Abstand zwischen den Ansichten.
 * Bei 3 Spielern bleibt das vierte Viertel leer.
 */
export function viewportsFor(
  n: number,
  width = GAME_W,
  height = GAME_H,
  gap = 2,
): Rect[] {
  if (!Number.isInteger(n) || n < 1 || n > 4) throw new Error(`unsupported player count ${n}`);
  if (n === 1) return [{ x: 0, y: 0, w: width, h: height }];

  const w1 = Math.floor((width - gap) / 2);
  const w2 = width - gap - w1;
  if (n === 2) {
    return [
      { x: 0, y: 0, w: w1, h: height },
      { x: w1 + gap, y: 0, w: w2, h: height },
    ];
  }

  const h1 = Math.floor((height - gap) / 2);
  const h2 = height - gap - h1;
  const quarters: Rect[] = [
    { x: 0, y: 0, w: w1, h: h1 },
    { x: w1 + gap, y: 0, w: w2, h: h1 },
    { x: 0, y: h1 + gap, w: w1, h: h2 },
    { x: w1 + gap, y: h1 + gap, w: w2, h: h2 },
  ];
  return quarters.slice(0, n);
}
