/** Serverwerte (Spielwerte stehen in core/config.ts). */
export const SERVER_CONFIG = {
  /** Tickdauer in ms: 20 Ticks pro Sekunde */
  stepMs: 50,
  /** So lange kann ein getrennter Spieler mit seinem Token zurückkehren */
  graceMs: 30_000,
  /** Raum ohne verbundenen Spieler wird nach so langer Zeit gelöscht */
  emptyRoomMs: 120_000,
  maxRooms: 100,
  /** Höchstens so viele Nachrichten pro Sekunde und Verbindung */
  maxMessagesPerSecond: 120,
  pingEveryMs: 15_000,
};
