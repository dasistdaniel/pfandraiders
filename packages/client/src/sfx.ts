import { MusicPlayer } from './music/player';
import { loadAudioToggles, nextAudioToggles, saveAudioToggles } from './settings';
import type { AudioToggles } from './settings';
import { SoundFx } from './sound';

/** Musik und Effekte an/aus für die ganze Sitzung (gespeichert in localStorage). */
let toggles: AudioToggles = loadAudioToggles();

/** Ein Soundsystem für die ganze Sitzung, damit der freigeschaltete AudioContext Szenenwechsel überlebt. */
export const sfx = new SoundFx(undefined, undefined, !toggles.effects);
/**
 * Hintergrundmusik auf demselben AudioContext; überlebt Szenenwechsel, damit das Lied nicht neu beginnt.
 * Sie hängt direkt am Ausgang des Kontexts, nicht an den Effekten: "Effekte aus" lässt die Musik also weiterlaufen.
 */
export const music = new MusicPlayer(sfx, { muted: !toggles.music });

/** Aktueller Zustand (Kopie). */
export function audioToggles(): AudioToggles {
  return { ...toggles };
}

/** Setzt Musik und Effekte, wirkt sofort und wird gespeichert. */
export function setAudioToggles(t: AudioToggles): void {
  toggles = { music: t.music, effects: t.effects };
  saveAudioToggles(toggles);
  sfx.setMuted(!toggles.effects);
  music.setMuted(!toggles.music);
}

/** Taste M bzw. "Ton" im Esc-Menü: nächster Zustand (siehe nextAudioToggles). Liefert den neuen Zustand. */
export function cycleAudio(): AudioToggles {
  setAudioToggles(nextAudioToggles(toggles));
  return audioToggles();
}

/** Bei einer Nutzergeste: Ton freischalten und die Musik (falls gewünscht) anlaufen lassen. */
export function unlockAudio(): void {
  sfx.unlock();
  music.start();
}
// Schon die erste Taste im Menü schaltet den Ton frei, nicht erst eine im Spiel
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);
