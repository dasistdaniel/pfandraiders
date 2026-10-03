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
