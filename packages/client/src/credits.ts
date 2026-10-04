/** Verwendete fremde Werke und das Projekt selbst, für die Credits-Seite im Menü und die README. */
export interface CreditEntry {
  title: string;
  author: string;
  license: string;
  url: string;
  note?: string;
}

/** Bekannte Lizenzangaben; 'Eigenes Werk' für das Projekt selbst (das Repo hat keine Lizenzdatei). */
export const KNOWN_LICENSES = ['CC0', 'MIT', 'Eigenes Werk'] as const;

export const CREDITS: CreditEntry[] = [
  {
    title: 'Roguelike Modern City',
    author: 'Kenney',
    license: 'CC0',
    url: 'https://kenney.nl/assets/roguelike-modern-city',
    note: 'Kacheln der Spielwelt',
  },
  {
    title: 'Tiny Characters Set',
    author: 'Fleurman',
    license: 'CC0',
    url: 'https://opengameart.org/content/tiny-characters-set',
    note: 'Spielerfiguren',
  },
  {
    title: 'RPG character sprites',
    author: 'GrafxKid',
    license: 'CC0',
    url: 'https://opengameart.org/content/rpg-character-sprites',
    note: 'Grundlage des Tiny Characters Set',
  },
  {
    title: 'Phaser 3',
    author: 'Photon Storm',
    license: 'MIT',
    url: 'https://phaser.io',
    note: 'Spiel-Framework',
  },
  {
    title: 'PfandRaiders',
    author: 'dasistdaniel',
    license: 'Eigenes Werk',
    url: 'https://github.com/dasistdaniel/pfandraiders',
    note: 'Sound, Musik, Hund, Polizist und Karten selbst erzeugt',
  },
];

/** Hauptzeile einer Credits-Zeile: Titel, Autor, Lizenz. */
export function creditLine(c: CreditEntry): string {
  return `${c.title} – ${c.author} (${c.license})`;
}

/** Kleine Zeile darunter: Link, ggf. mit Hinweis. */
export function creditDetail(c: CreditEntry): string {
  return c.note ? `${c.url}  ·  ${c.note}` : c.url;
}
