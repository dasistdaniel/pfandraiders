/** Palette der Pixelgrafik. `.` ist immer transparent, `P` und `Q` sind die Spielerfarbe (Haupt- und Schattenton). */
export const PALETTE: Record<string, number> = {
  k: 0x1b1b1f, // Umriss
  w: 0xffffff,
  g: 0x9e9e9e, // Pflaster
  G: 0x8a8a8a, // Pflaster dunkel
  h: 0xb0b0b0, // Pflaster hell
  r: 0x37474f, // Dach
  R: 0x2b3a42, // Dach dunkel
  t: 0x546e7a, // Dach hell
  f: 0x8d6e63, // Fassade
  F: 0x6d4c41, // Fassade dunkel
  y: 0xffca28, // Gelb
  o: 0xff9800, // Orange
  b: 0x42a5f5, // Blau
  B: 0x1565c0, // Dunkelblau
  e: 0x66bb6a, // Grün
  E: 0x2e7d32, // Dunkelgrün
  n: 0x795548, // Braun
  N: 0x4e342e, // Dunkelbraun
  s: 0xffcc99, // Haut
  d: 0xe0e0e0, // Hellgrau
  c: 0xc62828, // Rot
};

export interface Decoded {
  w: number;
  h: number;
  /** Länge w*h, Farbe 0xRRGGBB oder null (transparent). */
  px: (number | null)[];
}

/** Multipliziert jeden Kanal mit factor, rundet und begrenzt auf 255. */
export function shade(color: number, factor: number): number {
  const ch = (shift: number) => Math.min(255, Math.max(0, Math.round(((color >> shift) & 0xff) * factor)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function decodeSprite(rows: readonly string[], tint?: number): Decoded {
  const h = rows.length;
  const w = h > 0 ? rows[0].length : 0;
  if (h === 0 || w === 0) throw new Error('sprite must be at least 1x1');
  const px: (number | null)[] = [];
  rows.forEach((row, r) => {
    if (row.length !== w) throw new Error(`sprite row ${r} has length ${row.length}, expected ${w}`);
    for (let c = 0; c < w; c++) {
      const ch = row[c];
      if (ch === '.') px.push(null);
      else if (ch === 'P' || ch === 'Q') {
        if (tint === undefined) throw new Error(`tint required for '${ch}' at row ${r}, col ${c}`);
        px.push(ch === 'P' ? tint : shade(tint, 0.7));
      } else if (ch in PALETTE) px.push(PALETTE[ch]);
      else throw new Error(`unknown sprite char '${ch}' at row ${r}, col ${c}`);
    }
  });
  return { w, h, px };
}
