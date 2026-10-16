import type { DeviceRef } from './devices';
import type { KeyState } from './input';
import { deviceLabel, sameDevice } from './settings';

/** Gerät, mit dem online tatsächlich gespielt wird; `fallback` = gewähltes Gamepad fehlt, Tastatur springt ein. */
export interface ActiveDevice {
  device: DeviceRef;
  fallback: boolean;
}

/**
 * Online-Gerät für diesen Moment: das gewählte, außer es ist ein Gamepad, das nicht verbunden ist. Dann die zuletzt
 * genutzte Tastaturbelegung (`lastKeyboard`, Unbekanntes = Tastatur 1), damit man nicht reglos dasteht.
 */
export function activeOnlineDevice(chosen: DeviceRef, padConnected: (index: number) => boolean, lastKeyboard: number): ActiveDevice {
  if (chosen.kind === 'keyboard' || padConnected(chosen.index)) return { device: { ...chosen }, fallback: false };
  return { device: { kind: 'keyboard', layout: lastKeyboard === 1 ? 1 : 0 }, fallback: true };
}

/** Hinweis im HUD, solange die Tastatur für ein fehlendes Gamepad einspringt. */
export function fallbackNotice(keyboard: DeviceRef): string {
  return `Gamepad nicht verbunden: ${deviceLabel(keyboard)}`;
}

/** Irgendeine Spieltaste gehalten? (Echter Tastendruck während des Rückfalls.) */
export function anyKeyHeld(k: KeyState): boolean {
  return Object.values(k).some(Boolean);
}

/**
 * Online-Gerät einer Szene ohne Phaser: hält das gewählte (gespeicherte) und das aktive Gerät auseinander.
 * update() wird jedes Bild aufgerufen und meldet einen Wechsel mit Hinweistext ('' = keiner, beim ersten Gerät).
 */
export class OnlineDeviceTracker {
  active: DeviceRef | null = null;
  fallback = false;

  constructor(
    public chosen: DeviceRef,
    private lastKeyboard: number,
  ) {
    if (chosen.kind === 'keyboard') this.lastKeyboard = chosen.layout;
  }

  /** Neues Gerät (Einstellung, Esc-Menü, Auto-Wechsel); wirkt beim nächsten update(). */
  choose(d: DeviceRef): void {
    this.chosen = { ...d };
    if (d.kind === 'keyboard') this.lastKeyboard = d.layout;
  }

  /**
   * Neues aktives Gerät samt Hinweis, wenn sich Gerät oder Rückfall geändert haben; sonst null. (Wer auf Tastatur 2
   * spielt und ein fehlendes Gamepad wählt, behält die Tastatur, bekommt aber den Hinweis.)
   */
  update(padConnected: (index: number) => boolean): { device: DeviceRef; notice: string } | null {
    const next = activeOnlineDevice(this.chosen, padConnected, this.lastKeyboard);
    const first = this.active === null;
    if (!first && sameDevice(this.active!, next.device) && this.fallback === next.fallback) return null;
    this.active = next.device;
    this.fallback = next.fallback;
    const notice = next.fallback ? fallbackNotice(next.device) : first ? '' : `Steuerung: ${deviceLabel(next.device)}`;
    return { device: { ...next.device }, notice };
  }

  /** Rückfall behalten (echter Tastendruck): die Tastatur wird das gewählte Gerät. null = gerade kein Rückfall. */
  keepFallback(): DeviceRef | null {
    if (!this.fallback || !this.active) return null;
    this.choose(this.active);
    this.fallback = false;
    return { ...this.active };
  }
}
