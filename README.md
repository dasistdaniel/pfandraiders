# PfandRaiders

Retro-Top-Down-Spiel: Pfandflaschen sammeln, abgeben, Container ausbauen. Design: `docs/superpowers/specs/`, Pläne: `docs/superpowers/plans/`.

## Entwickeln

    npm install
    npm run dev        # Spiel im Browser (Vite)
    npm test           # Tests aller Pakete
    npm run typecheck

## Spielen

Lokal mit 1 bis 4 Spielern, jeder mit eigener Kamera. In der Lobby treten Spieler mit der Aktionstaste ihres Geräts bei, Start mit Leertaste oder Start-Taste des Gamepads.

| Gerät | Laufen | Aktion | Klauen | Container-Upgrade | Bolzenschneider |
|---|---|---|---|---|---|
| Tastatur 1 | WASD | E | Q | 1 | 2 |
| Tastatur 2 | Pfeile | Enter | / | , | . |
| Gamepad | Stick oder Steuerkreuz | A | B | X | Y |

Aktion: Suchen (halten), Pfand abgeben (drücken am Pfandautomaten). Klauen: Klauen-Taste halten (2 s) neben einem Mitspieler, der Flaschen im Container hat, egal was er gerade macht. Mit dem Bolzenschneider (im Shop 6,00 €) klaut ein neuer Druck der Klauen-Taste sofort alles, was in den eigenen Container passt. `R` oder die Aktionstaste startet nach Rundenende (nach kurzer Sperre) neu. Zwei Spieler an einer Tastatur sind durch Keyboard-Ghosting begrenzt (nicht alle Tastenkombinationen werden erkannt).

## Testhilfen per URL

`?solo=1` (ein Spieler, ohne Lobby), `?players=2` (n Spieler ohne Lobby, abwechselnd Tastatur 1 und 2), `?round=30` (Rundenlänge in Sekunden), `?seed=123` (feste Zufallsbefüllung).
