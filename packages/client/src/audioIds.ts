/**
 * Alle Audio-IDs des Spiels (verbindliche Liste: docs/SOUNDLISTE.md). Der Dateiname einer eigenen Audiodatei ist
 * genau die ID plus Endung, z. B. `public/sounds/knockout.ogg` oder `public/music/music_menu.ogg`.
 * Rein und ohne Browser- oder Node-Abhängigkeiten, damit Vite-Plugin, Client und Tests dieselbe Liste nutzen.
 */

/** Die 15 Effekte mit erzeugtem Ersatzklang (Rezept in sound.ts). */
export const SYNTH_IDS = [
  'pickup',
  'pling',
  'buy',
  'stealSuccess',
  'bite',
  'knockout',
  'punch',
  'hit',
  'spray',
  'policeCheck',
  'policeSeize',
  'zoneAnnounced',
  'roundEnd',
  'tick',
  'countdownGo',
] as const;

/** "Weitere Ereignisse": ohne Datei bleiben sie stumm. */
export const EVENT_IDS = [
  'revive',
  'robbed',
  'spray_hit',
  'spray_empty',
  'punch_miss',
  'low_health',
  'eat',
  'eat_full',
  'search',
  'search_empty',
  'bag_full',
  'deposit_start',
  'deposit_done',
  'dog_bark',
  'dog_treat',
  'siren_start',
  'id_shown',
  'zoneStart',
  'zoneEnd',
  'ready',
  'ready_off',
  'buy_denied',
  'cart_rent',
  'shop_start',
  'win',
  'join',
  'leave',
  'chat',
  'chat_send',
  'error',
  'ui_move',
  'ui_select',
  'ui_back',
  'avatar_pick',
] as const;

/** Effekte, die im Loop laufen (Start und Stopp über SoundFx.startLoop/stopLoop). */
export const LOOP_IDS = ['search'] as const;

/** Anzahl der Pling-Stufen; optional einzelne Dateien pling_1 bis pling_8. */
export const PLING_STEPS = 8;
export const PLING_VARIANT_IDS = Array.from({ length: PLING_STEPS }, (_, i) => `pling_${i + 1}`);

export const MUSIC_IDS = ['music_menu', 'music_game', 'music_ended'] as const;

export type SynthId = (typeof SYNTH_IDS)[number];
export type EventId = (typeof EVENT_IDS)[number];
export type LoopId = (typeof LOOP_IDS)[number];
/** Jeder Effekt, den SoundFx.play kennt. */
export type SoundId = SynthId | EventId;
export type MusicId = (typeof MUSIC_IDS)[number];

/** Alle IDs, die als Datei unter public/sounds erlaubt sind. */
export const SOUND_FILE_IDS: readonly string[] = [...SYNTH_IDS, ...EVENT_IDS, ...PLING_VARIANT_IDS];
/** Alle IDs, die als Datei unter public/music erlaubt sind. */
export const MUSIC_FILE_IDS: readonly string[] = [...MUSIC_IDS];

/** Unterstützte Endungen in absteigender Priorität: liegen mehrere Dateien für eine ID vor, gewinnt .ogg. */
export const AUDIO_EXTENSIONS = ['ogg', 'mp3', 'wav'] as const;
