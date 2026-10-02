# PfandRaiders

Retro-Top-Down-Spiel: Pfandflaschen sammeln, abgeben, Container ausbauen. Design: `docs/superpowers/specs/`, Pläne: `docs/superpowers/plans/`.

## Entwickeln

    npm install
    npm run dev        # Spiel im Browser (Vite)
    npm test           # Tests aller Pakete
    npm run typecheck

## Spielen

Lokal mit 1 bis 4 Spielern, jeder mit eigener Kamera. In der Lobby treten Spieler mit der Aktionstaste ihres Geräts bei, Start mit Leertaste oder Start-Taste des Gamepads.

| Gerät | Laufen | Aktion | Klauen | Container-Upgrade | Bolzenschneider | Leckerli | Essen |
|---|---|---|---|---|---|---|---|
| Tastatur 1 | WASD | E | Q | 1 | 2 | 3 | 4 |
| Tastatur 2 | Pfeile | Enter | / | , | . | ; | ' |
| Gamepad | Stick oder Steuerkreuz | A | B | X | Y | RB | LB |

Aktion: Suchen (halten), Pfand abgeben (drücken am Pfandautomaten). Klauen: Klauen-Taste halten (2 s) neben einem Mitspieler, der Flaschen im Container hat, egal was er gerade macht. Mit dem Bolzenschneider (im Shop 6,00 €) klaut ein neuer Druck der Klauen-Taste sofort alles, was in den eigenen Container passt. `R` oder die Aktionstaste startet nach Rundenende (nach kurzer Sperre) neu. Zwei Spieler an einer Tastatur sind durch Keyboard-Ghosting begrenzt (nicht alle Tastenkombinationen werden erkannt).

## Leben und Events

Leben sinken durch Hunger (1 pro 8 s), Hundebisse (15) und das Umfallen kostet Flaschen, Item und 25 % des Geldes; nach 10 s steht man am Startpunkt wieder auf. Essen im Shop (1,00 €) heilt 30. Hunde beißen zu und lassen sich mit einem Leckerli (1,00 €, wird automatisch eingesetzt, teilt den Item-Slot mit dem Bolzenschneider) ablenken. Polizisten konfiszieren nach 2 s Kontrolle die Hälfte der Flaschen, wer wegläuft, entgeht ihr. Stadion und Konzert laden regelmäßig zu Events ein: 20 s vorher gibt es einen Hinweis, dann liegt dort 60 s lang dreifach so viel Pfand und Spots füllen sich schneller nach.

## Testhilfen per URL

`?solo=1` (ein Spieler, ohne Lobby), `?players=2` (n Spieler ohne Lobby, abwechselnd Tastatur 1 und 2), `?round=30` (Rundenlänge in Sekunden), `?seed=123` (feste Zufallsbefüllung), `?events=now` (NPCs und Zonen sofort statt nach Minuten).
