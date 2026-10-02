# Pfandsammler

Retro-Top-Down-Spiel: Pfandflaschen sammeln, abgeben, Container ausbauen. Design: `docs/superpowers/specs/`, Pläne: `docs/superpowers/plans/`.

## Entwickeln

    npm install
    npm run dev        # Spiel im Browser (Vite)
    npm test           # Tests aller Pakete
    npm run typecheck

Steuerung: WASD/Pfeile laufen, E oder Leertaste suchen (halten) und abgeben (drücken), 1 kauft das nächste Container-Upgrade am Shop, R startet nach Rundenende neu.

Testhilfen per URL: `?round=30` (Runde in Sekunden), `?seed=123` (feste Zufallsbefüllung).
