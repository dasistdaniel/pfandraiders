import { CONFIG, MAX_ROOM_PLAYERS, ROUND_MS_CHOICES, ROUNDS_CHOICES, SHOP_CATEGORY_NAMES } from '@pfandraiders/core';
import type { ShopItemDef } from '@pfandraiders/core';
import type { KeyboardLayout } from './devices';
import { formatMoney } from './format';
import { roundMsLabel, roundsLabel } from './roundTime';
import { keyboardTabLabels } from './sources';
import type { KeyLabels, TabLabels } from './sources';

/**
 * Anleitung "So wird gespielt": fünf Seiten als reine Daten, alle Zahlen aus CONFIG und alle Tasten aus den echten
 * Belegungen, damit der Text nie etwas anderes sagt als das Spiel. Die Zeilen sind schon umbrochen (Monospace,
 * Zeichenzahl statt Pixel), die Szene zeichnet sie nur noch; so prüft der Test, dass nichts überläuft.
 */

/** Kleine Bilder links neben einer Zeile; die Szene nimmt dafür vorhandene Texturen. */
export type HelpIcon = 'bottles' | 'spot' | 'dropoff' | 'player' | 'dog' | 'police' | 'money';

export interface HelpEntry {
  /** bullet: Punkt mit optionalem Bild, heading: Zwischenüberschrift, table: Tabelle in Monospace */
  kind: 'bullet' | 'heading' | 'table';
  /** fertig umbrochene Zeilen */
  lines: string[];
  icon?: HelpIcon;
}

export interface HelpPage {
  title: string;
  entries: HelpEntry[];
}

/** Ein Gerät in der Steuerungstabelle. */
export interface HelpDevice {
  name: string;
  move: string;
  labels: KeyLabels;
  tabs: TabLabels;
  pause: string;
}

export interface HelpOptions {
  config?: typeof CONFIG;
  devices: HelpDevice[];
  /** Spieler lokal im Splitscreen */
  localMax: number;
}

/**
 * Maße der Inhaltsfläche (960 x 540): Text 16 px Monospace, höchstens 0,6 em je Zeichen (9,6 px). Punkte mit Bild
 * beginnen bei x 110, also 80 Zeichen bis x 878; die Tabelle beginnt bei x 70 (84 Zeichen bis x 877).
 * Höhe von y 76 bis 468: je Zeile 20 px, zwischen Einträgen 6 px, vor Überschriften 10 px mehr.
 */
export const HELP_LAYOUT = {
  textChars: 80,
  tableChars: 84,
  linePx: 20,
  entryGapPx: 6,
  headingGapPx: 10,
  contentH: 392,
};

/** Geschütztes Leerzeichen: hält Zahl und Einheit ("1,5 s", "3,00 €") in einer Zeile. */
export const NBSP = '\u00a0';
/** Ersetzt normale Leerzeichen durch geschützte. */
const nb = (s: string): string => s.replace(/ /g, NBSP);

/** Bricht an normalen Leerzeichen um (nicht an NBSP); Wörter länger als eine Zeile werden hart geteilt. */
export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (let word of text.split(/[ \t\n]+/).filter((w) => w.length > 0)) {
    while (word.length > maxChars) {
      if (cur) lines.push(cur);
      cur = '';
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!word) continue;
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= maxChars) cur += ` ${word}`;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur || lines.length === 0) lines.push(cur);
  return lines;
}

/** Geschätzte Höhe einer Seite in Pixeln (obere Schranke, siehe HELP_LAYOUT). */
export function pageHeight(page: HelpPage): number {
  const L = HELP_LAYOUT;
  return page.entries.reduce(
    (h, e, i) => h + (i > 0 ? L.entryGapPx : 0) + (i > 0 && e.kind === 'heading' ? L.headingGapPx : 0) + e.lines.length * L.linePx,
    0,
  );
}

/** Millisekunden als "1,5 s" (deutsches Komma, ohne überflüssige Nullen). */
export function secondsText(ms: number): string {
  return `${String(Math.round(ms) / 1000).replace('.', ',')}${NBSP}s`;
}

const percent = (f: number): string => `${Math.round(f * 100)}${NBSP}%`;
/** 0,5 als "die Hälfte", sonst als Prozent. */
const share = (f: number): string => (f === 0.5 ? 'die Hälfte' : `${percent(f)}`);
/** 3 als "dreifach", sonst "4-fach". */
const times = (n: number): string => ({ 2: 'doppelt', 3: 'dreifach' } as Record<number, string>)[n] ?? `${n}-fach`;
/** [a, b, c] als "a, b oder c" bzw. "a, b und c". */
const joinList = (xs: string[], last: string): string =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${last} ${xs[xs.length - 1]}`;
const orList = (xs: string[]): string => joinList(xs, 'oder');
const price = (def: ShopItemDef): string => nb(formatMoney(def.prices[0]));

/** Lauftasten einer Tastaturbelegung: "WASD", "Pfeile" oder die Tasten selbst. */
export function moveLabel(l: Pick<KeyboardLayout, 'up' | 'left' | 'down' | 'right'>): string {
  const keys = [l.up, l.left, l.down, l.right];
  if (keys.join('') === 'WASD') return 'WASD';
  if (keys.join(',') === 'UP,LEFT,DOWN,RIGHT') return 'Pfeile';
  return keys.join('/');
}

/** Esc öffnet im Spiel das Menü (alle Tastaturen), am Gamepad Start. */
const KEYBOARD_PAUSE = 'Esc';
const PAD_PAUSE = 'Start';
const PAD_MOVE = 'Stick/Steuerkreuz';

/** Geräte der Steuerungstabelle aus den echten Belegungen: jede Tastatur und das Gamepad. */
export function helpDevices(
  keyboards: readonly Pick<KeyboardLayout, 'up' | 'left' | 'down' | 'right' | 'labels'>[],
  pad: KeyLabels,
  padTabs: TabLabels,
): HelpDevice[] {
  return [
    ...keyboards.map((k, i) => ({
      name: `Tastatur ${i + 1}`,
      move: moveLabel(k),
      labels: k.labels,
      tabs: keyboardTabLabels(k.labels),
      pause: KEYBOARD_PAUSE,
    })),
    { name: 'Gamepad', move: PAD_MOVE, labels: pad, tabs: padTabs, pause: PAD_PAUSE },
  ];
}

/** Tabelle mit Spalten so breit wie ihr längster Eintrag, 2 Leerzeichen Abstand. */
function tableLines(rows: string[][]): string[] {
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
  return rows.map((r) => r.map((cell, c) => (c === r.length - 1 ? cell : cell.padEnd(widths[c]))).join('  ').trimEnd());
}

/** Punkt mit hängendem Einzug: Folgezeilen beginnen unter dem Text, nicht unter dem Punkt. */
const bullet = (text: string, icon?: HelpIcon): HelpEntry => ({
  kind: 'bullet',
  lines: wrapText(text, HELP_LAYOUT.textChars - 2).map((l, i) => `${i === 0 ? '•' : ' '} ${l}`),
  ...(icon ? { icon } : {}),
});
const heading = (text: string): HelpEntry => ({ kind: 'heading', lines: [text] });

export function helpPages({ config = CONFIG, devices, localMax }: HelpOptions): HelpPage[] {
  const c = config;
  const items = c.shop.items;
  const bv = c.bottleValue;
  const roundTimes = orList(ROUND_MS_CHOICES.map((ms) => roundMsLabel(ms).replace(' min', ''))) + ' Minuten';
  const defaultRound = roundMsLabel(c.roundMs).replace('min', 'Minuten');
  const roundsChoice = orList(ROUNDS_CHOICES.map((n) => (n === 0 ? roundsLabel(0) : String(n))));
  const hit = c.fight.damage;
  const gloveHit = c.fight.damage + c.fight.gloveBonus;
  const units = c.carry.perUnit;
  const flash = items.flashlight;
  const flashSteps = flash.values.slice(1).map((v) => `−${Math.round((1 - v) * 100)}`).join('/');
  const flashPrices = flash.prices.map((p) => nb(formatMoney(p))).join(', ');
  const perRound = Object.values(items)
    .filter((d) => d.perRound)
    .map((d) => d.name);
  const sharedKeyboard = devices.filter((d) => d.pause === KEYBOARD_PAUSE).length >= 2;

  const controlsTable = tableLines([
    ['Gerät', 'Laufen', 'Aktion', 'Ausrauben', 'Schlagen', 'Spray', 'Shop-Tabs', 'Menü'],
    ...devices.map((d) => [
      d.name,
      d.move,
      d.labels.action,
      d.labels.steal,
      d.labels.attack,
      d.labels.spray,
      `${d.tabs.prev} ${d.tabs.next}`,
      d.pause,
    ]),
  ]);

  return [
    {
      title: 'Ziel und Ablauf',
      entries: [
        bullet(`Sammle Pfandflaschen: Plastik ${bv.plastic}${NBSP}ct, Glas ${bv.glass}${NBSP}ct, Kasten ${bv.crate}${NBSP}ct.`, 'bottles'),
        bullet(
          `Suchen: an einem Spot (Mülleimer, Bank, Busch, Park, Haltestelle) stehen bleiben, Aktion drücken und ${secondsText(c.searchMs)} halten.`,
          'spot',
        ),
        bullet(
          `Am Pfandautomaten Aktion halten: Flasche für Flasche geht hinein (alle ${secondsText(c.depositEveryMs)}), das Pfand ist sofort Geld.`,
          'dropoff',
        ),
        bullet(`Mit leeren Händen trägst du ${c.carry.base} Flaschen; Taschen aus dem Shop schaffen Platz.`, 'player'),
        bullet(`Leere Spots füllen sich nach ${secondsText(c.refillMs)} wieder.`),
        heading('Eine Serie'),
        bullet(`Vor jeder Runde läuft ein Countdown von ${secondsText(c.countdownMs)}; solange steht alles still.`),
        bullet(`Eine Runde dauert ${roundTimes} (Standard ${defaultRound}).`),
        bullet('Danach: Rangliste, Shop-Phase, nächste Runde.'),
        bullet(`Online legt der Host die Rundenzahl fest: ${roundsChoice}.`),
        bullet('Gesamtsieger ist, wer in der ganzen Serie das meiste Pfand abgegeben hat.', 'money'),
      ],
    },
    {
      title: 'Steuerung',
      entries: [
        { kind: 'table', lines: controlsTable },
        heading('Gut zu wissen'),
        bullet('Aktion: suchen (drücken, halten), Pfand abgeben (halten), im Shop kaufen.'),
        bullet(
          `Im Spiel öffnet ${KEYBOARD_PAUSE} (Gamepad ${PAD_PAUSE}) das Menü mit Ton, Anleitung und Verlassen; M schaltet Musik und Effekte.`,
        ),
        bullet('Menüs: Pfeile oder W/S wählen, Enter/E/Leertaste bestätigt, Esc oder B geht zurück.'),
        bullet(
          `Lokal: in der Lobby mit der Aktionstaste beitreten, Start mit Leertaste oder Start-Taste.`,
        ),
        bullet('Online spielst du mit dem Gerät aus „Steuerung online“ in den Einstellungen.'),
        ...(sharedKeyboard ? [bullet('Zwei Spieler an einer Tastatur: nicht jede Tastenkombination kommt an.')] : []),
      ],
    },
    {
      title: 'Gegner und Kampf',
      entries: [
        bullet(
          `Hunde jagen dich und beißen (${c.npc.dog.biteDamage} Leben). Pro Spieler jagt höchstens ein Hund; ein Leckerli lenkt ihn automatisch ab.`,
          'dog',
        ),
        bullet(
          `Polizei kontrolliert dich: nach ${secondsText(c.npc.police.checkMs)} ist ${share(c.npc.police.fraction)} deiner Flaschen weg. Weglaufen hilft, Ausweisdokumente auch.`,
          'police',
        ),
        bullet(
          `Leben: ${c.health.max}. Hunger kostet 1 Leben alle ${secondsText(c.health.hungerEveryMs)}; Essen, das man beim Suchen findet, heilt ${c.health.food.heal} Leben.`,
          'player',
        ),
        bullet(
          `Schlagen trifft den nächsten Mitspieler: ${hit} Schaden (${gloveHit} mit Boxhandschuh), danach ${secondsText(c.fight.cooldownMs)} Pause.`,
        ),
        bullet(
          `Pfefferspray stößt den nächsten Mitspieler ${c.spray.knockbackPx}${NBSP}px weg und kostet ${c.spray.damage} Leben, danach ${secondsText(c.spray.cooldownMs)} Pause.`,
        ),
        bullet(
          `Bei 0 Leben bist du ${secondsText(c.health.knockoutMs)} ausgeknockt, danach geht es mit ${c.health.reviveHealth} Leben und ${secondsText(c.health.spawnShieldMs)} Schutz weiter.`,
        ),
        bullet(
          `Einen Ausgeknockten kann man einmal ausrauben: Ausrauben-Taste daneben nimmt ihm ${share(c.steal.fraction)} seiner Flaschen.`,
        ),
        bullet('Hunde und Polizei lassen Ausgeknockte in Ruhe. Geld und Gekauftes verliert man nie.'),
      ],
    },
    {
      title: 'Shop und Wertung',
      entries: [
        bullet(
          'Nach jeder Runde kaufen alle gleichzeitig; weiter geht es, wenn alle „Bereit“ sind. Links/rechts oder die Shop-Tabs wechseln die Kategorie.',
        ),
        bullet(
          `${SHOP_CATEGORY_NAMES.bags}: ${items.bag.name} ${price(items.bag)} (+${units.bag} Plätze), ${items.backpack.name} ${price(items.backpack)} (+${units.backpack}), ${items.cart.name} ${price(items.cart)} Miete (+${units.cart}, ${percent(1 - c.carry.cartSpeedMult)} langsamer).`,
        ),
        bullet(
          `${SHOP_CATEGORY_NAMES.upgrades}: ${flash.name} ${flashPrices} (Suchzeit ${flashSteps}${NBSP}%), ${items.card.name} ${price(items.card)} (Abgabe alle ${secondsText(c.depositEveryMsCard)}), ${items.card_plus.name} ${price(items.card_plus)} (+${c.shop.cardPlusBonusPct}${NBSP}% Pfand).`,
        ),
        bullet(`${SHOP_CATEGORY_NAMES.weapons}: ${items.glove.name} ${price(items.glove)} (Schlag ${gloveHit} statt ${hit} Schaden).`),
        bullet(
          `${SHOP_CATEGORY_NAMES.defense}: ${items.pepper.name} ${price(items.pepper)} (${items.pepper.unit ?? 1} Ladungen), ${items.id_papers.name} ${price(items.id_papers)} (keine Polizei), ${items.dog_treat.name} ${price(items.dog_treat)} (je Hund eins).`,
        ),
        bullet(`${joinList(perRound, 'und')} gelten nur für die nächste Runde, alles andere bleibt.`),
        heading('Geld und Verdienst'),
        bullet('Geld: was du gerade ausgeben kannst. Einkäufe ziehen es ab.', 'money'),
        bullet(
          'Verdienst (Runde und Gesamt): abgegebenes Pfand, Einkäufe mindern ihn nicht. Die Endwertung zählt den Gesamtverdienst.',
        ),
      ],
    },
    {
      title: 'Tipps',
      entries: [
        bullet(
          `Stadion und Konzert: ${secondsText(c.zone.announceMs)} vorher ein Hinweis, dann ${secondsText(c.zone.activeMs)} lang ${times(c.zone.multiplier)}es Pfand.`,
          'bottles',
        ),
        bullet('Vor Rundenende zum Automaten: Nur abgegebenes Pfand zählt, volle Taschen nicht.', 'dropoff'),
        bullet(`Mit vielen Flaschen Abstand zur Polizei halten, eine Kontrolle kostet ${share(c.npc.police.fraction)}.`, 'police'),
        bullet('Pfefferspray hält Angreifer auf Abstand, Leckerli halten Hunde fern.', 'dog'),
        bullet(`In Mülleimern liegt öfter etwas zu essen (${percent(c.health.food.chance.bin)}).`, 'spot'),
        heading('Mitspielen'),
        bullet(`Lokal: bis zu ${localMax} Spieler im Splitscreen, jeder mit Tastatur-Hälfte oder Gamepad.`, 'player'),
        bullet(
          `Online: bis zu ${MAX_ROOM_PLAYERS} Spieler je Raum. Raum erstellen oder beitreten (Raumliste, Code oder Link); Räume mit Schloss brauchen ein Passwort.`,
        ),
        bullet('In der Lobby wählst du deine Figur; der Browser merkt sie sich.'),
      ],
    },
  ];
}
