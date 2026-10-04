import type { KeyLabels } from './sources';

export interface MenuItem {
  id: string;
  label: string;
}

/** Auswahl in einer senkrechten Liste. Rein, damit sie ohne Phaser testbar ist. */
export class MenuModel {
  selected = 0;

  constructor(public items: MenuItem[]) {
    if (items.length === 0) throw new Error('MenuModel braucht mindestens einen Eintrag');
  }

  /** Läuft zyklisch: vom letzten Eintrag weiter geht es zum ersten und umgekehrt. */
  move(dir: -1 | 1): void {
    const n = this.items.length;
    this.selected = (this.selected + dir + n) % n;
  }

  activate(): string {
    return this.items[this.selected].id;
  }

  /** Werte außerhalb des Bereichs und Nicht-Ganzzahlen bleiben wirkungslos. */
  select(i: number): void {
    if (Number.isInteger(i) && i >= 0 && i < this.items.length) this.selected = i;
  }
}

export interface ControlSource {
  name: string;
  labels: KeyLabels;
}

/** Eine Zeile je Gerät, zusammengesetzt aus denselben Beschriftungen wie die Hinweise im Spiel. */
export function controlLines(keyboards: ControlSource[], pad: KeyLabels): string[] {
  const fmt = (l: KeyLabels): string =>
    `Aktion ${l.action}, Klauen ${l.steal}, Container ${l.upgrade}, Item ${l.item}, Leckerli ${l.treat}, Futter ${l.food}`;
  return [
    ...keyboards.map((k) => `${k.name}: ${fmt(k.labels)}`),
    `Gamepad (Stick/Steuerkreuz): ${fmt(pad)}`,
  ];
}

/**
 * Welcher Pfeil einer Reglerzeile ("Lautstärke: ◄ 70 % ►") liegt unter dem Klick?
 * -1 = linker Pfeil (leiser), 1 = rechter Pfeil (lauter), 0 = keiner.
 * localX ist die Klickposition von der linken Textkante, textWidth die Breite des ganzen Textes
 * (Monospace: gleich breite Zeichen). Treffer: der Pfeil selbst und je ein Zeichen daneben.
 */
export function arrowAt(label: string, localX: number, textWidth: number): -1 | 0 | 1 {
  if (!(textWidth > 0) || label.length === 0 || !Number.isFinite(localX)) return 0;
  const charW = textWidth / label.length;
  const idx = Math.floor(localX / charW);
  const left = label.indexOf('◄');
  const right = label.indexOf('►');
  if (left >= 0 && Math.abs(idx - left) <= 1) return -1;
  if (right >= 0 && Math.abs(idx - right) <= 1) return 1;
  return 0;
}
