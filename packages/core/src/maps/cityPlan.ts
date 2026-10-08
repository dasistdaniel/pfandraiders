import { TILE } from '../config';
import type { ZoneDef } from '../types';

/**
 * Stadtplan der Standardkarte "Stadt": 64 x 40 Kacheln, ein Zeichen = eine Kachel (16 px).
 * Daraus erzeugt `scripts/generateCity.ts` die Datei `city.tiled.json` (`planToTiled`).
 *
 * Legende
 *   fest:      R Backstein (Wohnhaus)  Y grau (Geschäft, Stadion)  E beige  X Glas (Büro)
 *              W Randbebauung/Hecke (nur am Rand)  o Brunnen/Wasser
 *              c Auto (immer als Paar: waagerecht `cc` oder senkrecht übereinander)
 *   weich:     t Baum  l Laterne (Ebene `soft`, nicht in `walls`): blockieren nur einen kleinen Kern in der
 *              Kachelmitte (CONFIG.softHalf), man geht daneben vorbei; Krone und Mast zeichnet `above`
 *   begehbar:  = Fahrbahn  + Zebrastreifen  . Gehweg/Platz  , Gras
 *   Objekte:   @ Spawn  D Pfandautomat  N NPC-Eingang (Hunde, Polizei; an Straßenenden am Rand
 *              und auf zwei Querstraßen nahe der Hauptstraße)
 *              Spots: b Bushaltestelle  n Bank  g Busch  m Mülltonne  p Park
 *   Objekte und Spots stehen auf begehbarem Boden.
 *
 * Aufteilung (Spec §6): Hauptstraße waagerecht (Gehweg Zeile 18, Fahrbahn 19 bis 21, Gehweg 22),
 * drei Querstraßen (Fahrbahn Spalten 14-15, 31-32, 48-49, Gehwege daneben).
 * Oben: Wohnhäuser links, Geschäfte in der Mitte, Büros, Stadionplatz rechts (Zone `stadium`).
 * Unten: Park links, Marktplatz, Brunnenplatz mit Geschäften, Konzertpark rechts (Zone `concert`).
 *
 *            0         1         2         3         4         5         6
 *            0123456789012345678901234567890123456789012345678901234567890123
 */
export const CITY_PLAN: string[] = [
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', //  0
  'WRRRRR,,EEEE,.N=.YYYYYY..EEEEE.==.XXXXXX..XXXXX.N=.YYYYYYYYYYYYW', //  1
  'WRRRRR,,EEEE,.==.YYYYYY..EEEEE.==.XXXXXX..XXXXX.==.YYYYYYYYYYYYW', //  2
  'WRRRRR,tEEEE,.==.YYYYYY..EEEEE.==.XXXXXX..XXXXX.=c.YYYYYYYYYYYYW', //  3
  'WRRRRR,,EEEE,.==.YYYYYY.mEEEEE.==.XXXXXX..XXXXX.=c.YYYYYYYYYYYYW', //  4
  'W,g,,,,,,,,n,.=c.YYYYYY..EEEEE.==.XXXXXX.mXXXXX.==.............W', //  5
  'W.............=c...............==.XXXXXX..XXXXX.==..m........b.W', //  6
  'WEEEE,,RRRRR,.==...D...l.......==...............==.............W', //  7
  'WEEEE,tRRRRR,.==.t...n.......t.==.t..n..t.....t.==....n.....n..W', //  8
  'WEEEE,,RRRRR,l==...............==...............==.............W', //  9
  'WEEEE,,RRRRR,.==.EEEE..YYYYYYY.=c..XXXXXXXXXX...==..........m..W', // 10
  'W,,m,,,,,,,,,.==.EEEE..YYYYYYY.=c..XXXXXXXXXX...==......n......W', // 11
  'W.............==.EEEE..YYYYYYY.==..XXXXXXXXXX...==.............W', // 12
  'W,RRRRR,,EEE,.==.EEEE.tYYYYYYY.==..XXXXXXXXXX...==.t,,,,t,,,,,tW', // 13
  'W,RRRRR,,EEE,.==.EEEE..YYYYYYY.==..XXXXXXXXXX...==.,,,,,,,,,,,,W', // 14
  'W,RRRRR,,EEE,.==....m..........==..m............==.t,,,,t,,,,,tW', // 15
  'W,,,,,,,,,,g,.==...........n..lN=.......t......l==.............W', // 16
  'Wt.t.t.t.t.t..==...............==...............==b............W', // 17
  'W......@....bl++........@..l...++.b.....@..l....++.......@..l..W', // 18
  'W====cc======+===========cc===+==========cc====+==========cc===W', // 19
  'WN===========+================+================+==============NW', // 20
  'W========cc==+=======cc=======+=======cc=======+=====cc========W', // 21
  'W......@.m....++.b..l...@......++....l..@.....b.++......l@.....W', // 22
  'Wt,,,t,,,t,,..==..............b==...............==.t,,t,,,,t,,tW', // 23
  'W,,,,,,,,,,,..==...t.......t...==..l....t.......N=.,,,,,,,,,,,,W', // 24
  'W,p,,n,,,,g,..==...............==.....n.........==.t,,,,,,,,,,tW', // 25
  'W,,,,,,,,,,,..==...n.......n...==...t..oo...t...==.,,,,,,g,,,,,W', // 26
  'W,t,,ooo,,t,..==...............==......oo..D....=c.,,p,,,,,,,,,W', // 27
  'W,,,,ooo,,,,..==..m.........m..==.........n.....=c.,,,,,,m,,,,,W', // 28
  'W,,,,,,,,p,,..=c...............==...m...........==.,,,,,,,,,p,,W', // 29
  'W.............=c...............==...............==.,,,,p,,,,,,,W', // 30
  'W,,,t,,,,t,,..==...t.......t...==.YYYYY...EEEEE.==.,n,,,,,,,,,,W', // 31
  'W,p,,,,n,,,,..==...............==.YYYYY...EEEEE.==.,,,,,,,,,n,,W', // 32
  'W,,,,t,,,,,,..==.EEEEEE...RRRR.=c.YYYYY...EEEEE.==.,,,,,,,,,,,,W', // 33
  'W,,,,,,,,,,,..==.EEEEEE...RRRR.=c.YYYYY...EEEEE.==lt,,,,,,,,,,tW', // 34
  'W,,,t,,,,,,,..==.EEEEEE...RRRR.==.YYYYY...EEEEE.==.,,EEEEEEEE,,W', // 35
  'W,,,,,,,,,,,..==.EEEEEE...RRRR.==.YYYYY.g.EEEEE.==.,,EEEEEEEE,,W', // 36
  'Wt,,,,t,,,,,t.==.EEEEEE...RRRR.==...............==.,,EEEEEEEE,,W', // 37
  'W,,,,,,,,t,,,.==...............N=........m......==.t..........tW', // 38
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', // 39
];

/** Pixelrechteck aus Kachelspalten und -zeilen (jeweils einschließlich) */
const tiles = (c0: number, r0: number, c1: number, r1: number) => ({
  x0: c0 * TILE,
  y0: r0 * TILE,
  x1: (c1 + 1) * TILE,
  y1: (r1 + 1) * TILE,
});

/** Zonen in Pixeln: Stadionplatz Spalten 51-62, Zeilen 5-11; Konzertpark Spalten 51-62, Zeilen 26-33. */
export const CITY_ZONES: ZoneDef[] = [
  { id: 'stadium', name: 'Stadion', area: tiles(51, 5, 62, 11) },
  { id: 'concert', name: 'Konzert', area: tiles(51, 26, 62, 33) },
];
