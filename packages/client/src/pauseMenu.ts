import { MenuModel } from './menuModel';
import type { MenuItem } from './menuModel';

/** Ansicht des Esc-Menüs im Spiel: zu, Hauptseite oder Rückfrage vor dem Verlassen. */
export type PauseView = 'closed' | 'main' | 'confirm';
/** Ergebnis einer Bestätigung. Nur 'toggleSound' und 'leave' muss die Szene selbst ausführen. */
export type PauseAction = 'resume' | 'toggleSound' | 'askLeave' | 'leave' | 'stay';

export const PAUSE_MAIN_ITEMS: MenuItem[] = [
  { id: 'resume', label: 'Fortsetzen' },
  { id: 'toggleSound', label: 'Ton' },
  { id: 'askLeave', label: 'Spiel verlassen' },
];

export const PAUSE_CONFIRM_ITEMS: MenuItem[] = [
  { id: 'leave', label: 'Ja, verlassen' },
  { id: 'stay', label: 'Nein, zurück' },
];

const ASK_LEAVE_INDEX = PAUSE_MAIN_ITEMS.findIndex((i) => i.id === 'askLeave');
const STAY_INDEX = PAUSE_CONFIRM_ITEMS.findIndex((i) => i.id === 'stay');

/** Zustand des Esc-Menüs ohne Phaser: Szene liest Tasten, ruft die Übergänge und zeichnet items/selected. */
export class PauseMenu {
  view: PauseView = 'closed';
  private model = new MenuModel(PAUSE_MAIN_ITEMS);

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
    this.model = new MenuModel(PAUSE_MAIN_ITEMS);
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
    if (this.view === 'confirm') this.showMain(ASK_LEAVE_INDEX);
    else this.close();
  }

  move(dir: -1 | 1): void {
    if (this.isOpen) this.model.move(dir);
  }

  select(i: number): void {
    if (this.isOpen) this.model.select(i);
  }

  /** Bestätigt den gewählten Eintrag und führt den Übergang aus. null, wenn das Menü zu ist. */
  activate(): PauseAction | null {
    if (!this.isOpen) return null;
    const action = this.model.activate() as PauseAction;
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
        this.showMain(ASK_LEAVE_INDEX);
        break;
      case 'toggleSound':
        break; // Menü bleibt offen, nur die Beschriftung ändert sich
    }
    return action;
  }

  private showMain(selected: number): void {
    this.view = 'main';
    this.model = new MenuModel(PAUSE_MAIN_ITEMS);
    this.model.select(selected);
  }
}

/** Beschriftung eines Eintrags; der Ton-Eintrag zeigt den aktuellen Zustand. */
export function pauseLabel(item: MenuItem, muted: boolean): string {
  return item.id === 'toggleSound' ? `Ton: ${muted ? 'aus' : 'an'}` : item.label;
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
