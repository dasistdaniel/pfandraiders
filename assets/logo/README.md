# PfandRaiders-Logo

"PFAND" über "RAIDERS" in einer 5x7-Pixelschrift, rechtsbündig, cremefarben mit 1 Einheit dunkler Kontur (volle Ausdehnung um jedes Schriftpixel, Innenräume der Buchstaben dunkel); dahinter vier parallele 45-Grad-Streifen.

| Datei | Verwendung |
| --- | --- |
| `logo.svg` | Farbversion (auch `packages/client/public/logo.svg`) |
| `logo-black.svg` | einfarbig schwarz für helle Hintergründe, Kontur weiß ausgespart |
| `logo-white.svg` | weiß für dunkle Hintergründe, Kontur `#111111` |
| `packages/client/public/favicon.svg` | Favicon: dunkles Quadrat, Streifen, Pixel-"P" mit dunkler Kontur und dunklem Innenraum |

## Farben

| Farbe | Wert |
| --- | --- |
| Rot | `#ef5350` |
| Gelb | `#ffca28` |
| Grün | `#66bb6a` |
| Blau | `#42a5f5` |
| Creme (Schrift) | `#fff6d6` |
| Dunkel (Kontur, Favicon-Grund) | `#1b1b1f` |

## Neu erzeugen

Die Dateien sind generiert, nicht von Hand bearbeiten. Quelle ist `packages/client/src/logo.ts` (Schrift, Maße, Farben); im Spiel zeichnet `packages/client/src/logoTexture.ts` dieselbe Geometrie als Textur.

    npm run logo

Ein Test (`packages/client/test/logo.test.ts`) prüft, dass die eingecheckten Dateien der Ausgabe entsprechen.
