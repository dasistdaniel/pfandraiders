import { DEFAULT_MAP_ID, isMapId, isSelectableMapId, mapName } from '@pfandraiders/core';
import type { MapId } from '@pfandraiders/core';

/**
 * Karte eines lokalen Spiels: `?map=` (Testhilfe) vor der Wahl aus Lobby bzw. Shop (gilt für die ganze Serie)
 * vor der gespeicherten. Unbekannte Kennungen werden übersprungen; zuletzt die Standardkarte.
 * Versteckte Karten (Übungskarte) gibt es nur per `?map=` (der Shop reicht sie dann als Wahl weiter), nie aus dem Speicher.
 */
export function chooseLocalMapId(urlParam: string | null, chosen: unknown, stored: string): MapId {
  if (isMapId(urlParam)) return urlParam;
  if (isMapId(chosen)) return chosen;
  return isSelectableMapId(stored) ? stored : DEFAULT_MAP_ID;
}

/** Zeile der lokalen Lobby, z. B. "Karte: ▲ Stadt ▼  (hoch/runter)". */
export function mapLine(id: MapId): string {
  return `Karte: ▲ ${mapName(id)} ▼  (hoch/runter)`;
}
