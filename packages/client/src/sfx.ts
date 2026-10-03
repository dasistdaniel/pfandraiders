import { MusicPlayer } from './music/player';
import { SoundFx } from './sound';

/** Ein Soundsystem für die ganze Sitzung, damit der freigeschaltete AudioContext Szenenwechsel überlebt. */
export const sfx = new SoundFx();
/** Hintergrundmusik auf demselben AudioContext; überlebt Szenenwechsel, damit das Lied nicht neu beginnt. */
export const music = new MusicPlayer(sfx, { muted: sfx.muted });
// Taste M und der Menüpunkt „Ton“ schalten über sfx um: die Musik folgt
sfx.onMuteChange = (muted) => music.setMuted(muted);

/** Bei einer Nutzergeste: Ton freischalten und die Musik (falls gewünscht) anlaufen lassen. */
export function unlockAudio(): void {
  sfx.unlock();
  music.start();
}
// Schon die erste Taste im Menü schaltet den Ton frei, nicht erst eine im Spiel
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);
