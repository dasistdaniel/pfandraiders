import { MenuModel } from './menuModel';
import type { MenuItem } from './menuModel';
import type { DeviceRef } from './devices';
import { audioMenuLabel, deviceLabel } from './settings';
import type { AudioToggles } from './settings';

/** Ansicht des Esc-Menüs im Spiel: zu, Hauptseite oder Rückfrage vor dem Verlassen. */
export type PauseView = 'closed' | 'main' | 'confirm';
/**
 * Ergebnis einer Bestätigung. Nur 'toggleSound', 'deviceNext'/'devicePrev' (online: Steuerung wechseln), 'help' und
 * 'leave' muss die Szene selbst ausführen.
 */
export type PauseAction = 'resume' | 'toggleSound' | 'deviceNext' | 'devicePrev' | 'help' | 'askLeave' | 'leave' | 'stay';

export const PAUSE_MAIN_ITEMS: MenuItem[] = [
  { id: 'resume', label: 'Fortsetzen' },
  { id: 'toggleSound', label: 'Ton' },
  { id: 'help', label: 'Anleitung' },
  { id: 'askLeave', label: 'Spiel verlassen' },
];

/** Online kommt "Steuerung" dazu (lokal hängen die Plätze an ihren Geräten). */
export const PAUSE_ONLINE_ITEMS: MenuItem[] = [
  { id: 'resume', label: 'Fortsetzen' },
  { id: 'toggleSound', label: 'Ton' },
  { id: 'device', label: 'Steuerung' },
  { id: 'help', label: 'Anleitung' },
  { id: 'askLeave', label: 'Spiel verlassen' },
];

/** Höchstens so viele Einträge hat eine Seite des Esc-Menüs (Platz im Overlay). */
export const PAUSE_MAX_ITEMS = Math.max(PAUSE_MAIN_ITEMS.length, PAUSE_ONLINE_ITEMS.length, 2);

export const PAUSE_CONFIRM_ITEMS: MenuItem[] = [
  { id: 'leave', label: 'Ja, verlassen' },
  { id: 'stay', label: 'Nein, zurück' },
];

const STAY_INDEX = PAUSE_CONFIRM_ITEMS.findIndex((i) => i.id === 'stay');

/** Zustand des Esc-Menüs ohne Phaser: Szene liest Tasten, ruft die Übergänge und zeichnet items/selected. */
export class PauseMenu {
  view: PauseView = 'closed';
  private readonly mainItems: MenuItem[];
  private readonly askLeaveIndex: number;
  private model: MenuModel;

  /** `online`: mit dem Eintrag "Steuerung". */
  constructor(online = false) {
    this.mainItems = online ? PAUSE_ONLINE_ITEMS : PAUSE_MAIN_ITEMS;
    this.askLeaveIndex = this.mainItems.findIndex((i) => i.id === 'askLeave');
    this.model = new MenuModel(this.mainItems);
  }

  get isOpen(): boolean {
    return this.view !== 'closed';
  }

  get items(): MenuItem[] {
    return this.model.items;
  }

  get selected(): number {
    return this.model.selected;
  }

  /** Öffnet die Hauptseite mit "Fortsetzen" ausgewählt. */
  open(): void {
    this.view = 'main';
    this.model = new MenuModel(this.mainItems);
  }

  close(): void {
    this.view = 'closed';
  }

  /** Esc oder Gamepad-Start: öffnet ein geschlossenes Menü, sonst wie back(). */
  toggle(): void {
    if (this.view === 'closed') this.open();
    else this.back();
  }

  /** Esc oder Gamepad-B im offenen Menü: Rückfrage → Hauptseite, Hauptseite → zu. */
  back(): void {
    if (this.view === 'confirm') this.showMain(this.askLeaveIndex);
    else this.close();
  }

  move(dir: -1 | 1): void {
    if (this.isOpen) this.model.move(dir);
  }

  select(i: number): void {
    if (this.isOpen) this.model.select(i);
  }

  /** Links/rechts: wechselt auf dem Eintrag "Steuerung" das Gerät; sonst null (keine Wirkung). */
  adjust(dir: -1 | 1): PauseAction | null {
    if (this.view !== 'main' || this.model.activate() !== 'device') return null;
    return dir === 1 ? 'deviceNext' : 'devicePrev';
  }

  /** Bestätigt den gewählten Eintrag und führt den Übergang aus. null, wenn das Menü zu ist. */
  activate(): PauseAction | null {
    if (!this.isOpen) return null;
    const id = this.model.activate();
    // Bestätigen auf "Steuerung" schaltet zum nächsten Gerät weiter
    const action = (id === 'device' ? 'deviceNext' : id) as PauseAction;
    switch (action) {
      case 'resume':
      case 'leave':
        this.close();
        break;
      case 'askLeave':
        this.view = 'confirm';
        this.model = new MenuModel(PAUSE_CONFIRM_ITEMS);
        this.model.select(STAY_INDEX); // vorsichtig: ein versehentlicher Doppeldruck verlässt nicht
        break;
      case 'stay':
        this.showMain(this.askLeaveIndex);
        break;
      case 'deviceNext':
      case 'devicePrev':
        break; // Menü bleibt offen, nur die Beschriftung ändert sich
      case 'toggleSound':
        break; // Menü bleibt offen, nur die Beschriftung ändert sich
      case 'help':
        break; // Menü bleibt offen; die Anleitung liegt darüber, Esc/B führt hierher zurück
    }
    return action;
  }

  private showMain(selected: number): void {
    this.view = 'main';
    this.model = new MenuModel(this.mainItems);
    this.model.select(selected);
  }
}

/**
 * Beschriftung eines Eintrags; der Ton-Eintrag zeigt, was von Musik und Effekten an ist, der Steuerungs-Eintrag
 * das gewählte Gerät ("Steuerung: ◄ Gamepad 1 ►").
 */
export function pauseLabel(item: MenuItem, audio: AudioToggles, device?: DeviceRef): string {
  if (item.id === 'toggleSound') return audioMenuLabel(audio);
  if (item.id === 'device' && device) return `${item.label}: ◄ ${deviceLabel(device)} ►`;
  return item.label;
}

export function pauseTitle(view: PauseView, online: boolean): string {
  if (view === 'confirm') return 'Wirklich verlassen?';
  return online ? 'Menü' : 'Pause';
}

/** Hinweiszeile unter den Einträgen. */
export function pauseHint(view: PauseView, online: boolean): string {
  if (view === 'confirm') return online ? 'Dein Platz im Raum wird sofort frei.' : 'Die Runde endet für alle.';
  return online ? 'Das Spiel läuft weiter.' : 'Spiel pausiert.';
}
