import type { GameState, Player } from '@pfandraiders/core';

/**
 * Große Ausgeknockt-Anzeige mitten im eigenen Viewport (wie der Countdown, siehe countdown.ts). Reines Modul
 * ohne Phaser: Texte und Schriftgrößen. Gezeichnet wird sie vom HUD des Spielers, also nur in seinem Bild
 * (Splitscreen: nur im Viewport des Ausgeknockten, online nur in der eigenen Ansicht).
 */

export const KNOCKOUT_TITLE = 'AUSGEKNOCKT';
export const ROBBED_TEXT = 'Ausgeraubt!';

export interface KnockoutText {
  title: string;
  /** Restsekunden, aufgerundet ("20" bis "1") */
  seconds: string;
  /** "Ausgeraubt!" oder '' */
  robbed: string;
}

/** Texte der Anzeige; null = nichts zeigen (wach, Rundenende mit Ergebnisfeld oder ungültige Werte). */
export function knockoutText(
  p: Pick<Player, 'unconsciousMs' | 'robbed'>,
  phase: GameState['phase'],
): KnockoutText | null {
  const ms = p.unconsciousMs;
  if (phase === 'ended' || !Number.isFinite(ms) || ms <= 0) return null;
  return { title: KNOCKOUT_TITLE, seconds: String(Math.ceil(ms / 1000)), robbed: p.robbed ? ROBBED_TEXT : '' };
}

/** Wie die Countdown-Zahl: Anteil der kürzeren Viewport-Seite, begrenzt auf [min, max] px. */
const SECONDS_FONT = { share: 0.3, min: 48, max: 96 };
const TITLE_MAX = 72;
/** Monospace: ein Zeichen ist etwa 0,6 Schriftgrößen breit; der Titel darf 90 % der Breite füllen. */
const CHAR_W = 0.6;
const TITLE_FILL = 0.9;
const ROBBED_SHARE = 0.35;
const ROBBED_MIN = 16;

/** Schriftgrößen in px: Titel passt auch in schmale Splitscreen-Ansichten, die Zahl so groß wie der Countdown. */
export function knockoutFontSizes(view: { w: number; h: number }): { title: number; seconds: number; robbed: number } {
  const seconds = Math.round(
    Math.min(SECONDS_FONT.max, Math.max(SECONDS_FONT.min, Math.min(view.w, view.h) * SECONDS_FONT.share)),
  );
  const fit = Math.floor((view.w * TITLE_FILL) / (KNOCKOUT_TITLE.length * CHAR_W));
  const title = Math.max(ROBBED_MIN + 1, Math.min(TITLE_MAX, seconds, fit));
  const robbed = Math.max(ROBBED_MIN, Math.round(title * ROBBED_SHARE));
  return { title, seconds, robbed };
}
