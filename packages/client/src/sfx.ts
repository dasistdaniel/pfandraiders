import { SoundFx } from './sound';

/** Ein Soundsystem für die ganze Sitzung, damit der freigeschaltete AudioContext Szenenwechsel überlebt. */
export const sfx = new SoundFx();
// Schon die erste Taste im Menü schaltet den Ton frei, nicht erst eine im Spiel
window.addEventListener('keydown', () => sfx.unlock());
window.addEventListener('pointerdown', () => sfx.unlock());
