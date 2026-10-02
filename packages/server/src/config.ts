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
  /** Mehr als so viele ungesendete Bytes pro Socket: Snapshots werden verworfen */
  maxBufferedBytes: 256 * 1024,
  /** Bleibt ein Socket so lange über der Grenze, wird er getrennt */
  bufferedStaleMs: 5000,
  maxConnections: 400,
  /** Höchstens eine rate_limited-Antwort pro Socket in diesem Abstand */
  rateNoticeMs: 1000,
  /** So lange dauerhaft über dem Limit: Verbindung schliessen (1008) */
  rateCloseMs: 5000,
  /** So viele Handler-Ausnahmen pro Socket, dann wird er geschlossen */
  maxHandlerErrors: 5,
  /** So viele Tick-Fehler in Folge, dann wird der Raum entfernt */
  maxTickFailures: 3,
};
