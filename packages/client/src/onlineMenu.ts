import type { ErrorCode, RosterEntry } from '@pfandraiders/core';
import { buildLabel, currentBuild, versionMismatch } from './buildInfo';
import { OnlineConnection } from './online';
import type { SocketFactory } from './online';

const TOKEN_KEY = (room: string) => `pfandraiders.token.${room}`;
const NAME_KEY = 'pfandraiders.name';

function safeGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key) ?? (key === NAME_KEY ? localStorage.getItem(key) : null);
  } catch {
    return null;
  }
}

function safeRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* egal */
  }
}

function safeSet(key: string, value: string, persistent = false): void {
  try {
    sessionStorage.setItem(key, value);
    if (persistent) localStorage.setItem(key, value);
  } catch {
    /* Speicher nicht verfügbar: dann geht es ohne */
  }
}

const ERRORS: Record<ErrorCode, string> = {
  bad_message: 'Ungültige Eingabe.',
  room_not_found: 'Raum nicht gefunden.',
  room_full: 'Der Raum ist voll.',
  name_taken: 'Der Name ist schon vergeben.',
  not_host: 'Nur der Host kann starten.',
  already_started: 'Die Runde läuft bereits.',
  need_players: 'Mindestens zwei Spieler nötig.',
  not_in_room: 'Du bist in keinem Raum.',
  rate_limited: 'Zu viele Nachrichten.',
  too_many_rooms: 'Der Server ist ausgelastet.',
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  style = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  if (style) e.setAttribute('style', style);
  return e;
}

/**
 * Zeigt ein Overlay zum Erstellen oder Betreten eines Raums und die Spielerliste.
 * Löst mit der Verbindung auf, sobald der Server die Runde startet. Löst mit null auf, wenn abgebrochen wird.
 */
export function showOnlineMenu(
  url: string,
  socketFactory: SocketFactory = (u) => new WebSocket(u) as unknown as ReturnType<SocketFactory>,
): Promise<OnlineConnection | null> {
  return new Promise((resolve) => {
    const root = el('div', {}, 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);color:#fff;font:16px monospace;z-index:10');
    const box = el('div', {}, 'background:#222;padding:20px;border:2px solid #888;min-width:320px;max-width:90vw;box-sizing:border-box');
    root.appendChild(box);
    // Phaser hängt am window und verschluckt gefangene Tasten (E, O, Leertaste ...), also hier stoppen
    for (const type of ['keydown', 'keyup', 'keypress']) root.addEventListener(type, (e) => e.stopPropagation());
    document.body.appendChild(root);

    const conn = new OnlineConnection(url, socketFactory);
    let finished = false;
    const finish = (result: OnlineConnection | null) => {
      if (finished) return;
      finished = true;
      conn.onStart = null;
      conn.onClosed = null;
      conn.onError = null;
      conn.onLobby = null;
      conn.onJoined = null;
      root.remove();
      if (result === null) conn.close();
      resolve(result);
    };

    const message = el('div', {}, 'color:#ff8a80;min-height:1.2em;margin-top:8px');
    const showError = (text: string) => {
      message.textContent = text;
    };
    conn.onError = (code, text) => showError(ERRORS[code] ?? text);
    conn.onClosed = () => {
      showError('Verbindung zum Server verloren.');
    };
    conn.onStart = () => finish(conn);

    const renderEntry = () => {
      box.replaceChildren();
      box.appendChild(el('div', { textContent: 'Online spielen' }, 'font-size:22px;margin-bottom:8px'));
      box.appendChild(el('div', { textContent: `Server: ${url}` }, 'color:#aaa;font-size:14px;margin-bottom:10px'));
      const name = el('input', { placeholder: 'Dein Name', maxLength: 16, value: safeGet(NAME_KEY) ?? '' }, 'width:100%;box-sizing:border-box;margin-bottom:8px;font:inherit');
      const code = el('input', { placeholder: 'Raumcode', maxLength: 4 }, 'width:100%;box-sizing:border-box;margin-bottom:8px;font:inherit;text-transform:uppercase');
      const create = el('button', { textContent: 'Raum erstellen' }, 'font:inherit;margin-right:8px');
      const join = el('button', { textContent: 'Beitreten' }, 'font:inherit;margin-right:8px');
      const cancel = el('button', { textContent: 'Abbrechen' }, 'font:inherit');
      box.append(name, code, create, join, cancel, message);

      const need = () => {
        if (name.value.trim().length === 0) {
          showError('Bitte einen Namen eingeben.');
          return false;
        }
        safeSet(NAME_KEY, name.value.trim(), true);
        if (conn.status === 'idle' || conn.status === 'closed') {
          showError('');
          try {
            conn.connect();
          } catch {
            showError('Server nicht erreichbar.');
            return false;
          }
        }
        return true;
      };
      const whenOpen = (fn: () => void) => {
        const t0 = Date.now();
        const wait = () => {
          if (finished) return;
          if (conn.status === 'open') return fn();
          if (conn.status === 'closed' || Date.now() - t0 > 5000) return showError('Server nicht erreichbar.');
          setTimeout(wait, 50);
        };
        wait();
      };
      create.onclick = () => {
        if (need()) whenOpen(() => conn.create(name.value.trim()));
      };
      join.onclick = () => {
        if (!need()) return;
        const room = code.value.trim().toUpperCase();
        whenOpen(() => conn.join(room, name.value.trim(), safeGet(TOKEN_KEY(room)) ?? undefined));
      };
      cancel.onclick = () => finish(null);
      const onEnter = (primary: HTMLButtonElement) => (e: KeyboardEvent) => {
        if (e.key === 'Enter') primary.click();
      };
      name.onkeydown = onEnter(code.value.trim() ? join : create);
      code.onkeydown = onEnter(join);
      name.focus();
    };

    const renderLobby = () => {
      box.replaceChildren();
      box.appendChild(el('div', { textContent: `Raum ${conn.room}` }, 'font-size:26px;letter-spacing:4px;margin-bottom:4px'));
      box.appendChild(el('div', { textContent: 'Code weitergeben, damit Freunde beitreten.' }, 'color:#aaa;font-size:14px;margin-bottom:4px'));
      if (conn.serverBuild) {
        box.appendChild(el('div', { textContent: `Server: ${buildLabel(conn.serverBuild)}` }, 'color:#888;font-size:12px;margin-bottom:4px'));
      }
      if (versionMismatch(currentBuild(), conn.serverBuild)) {
        box.appendChild(
          el(
            'div',
            { textContent: 'Achtung: Client und Server haben verschiedene Versionen. Seite neu laden (Strg+F5) oder den Host informieren.' },
            'color:#ffa726;font-size:13px;margin-bottom:4px',
          ),
        );
      }
      box.appendChild(el('div', {}, 'margin-bottom:6px'));
      const list = el('div', {}, 'margin-bottom:10px');
      const draw = (players: RosterEntry[]) => {
        list.replaceChildren();
        for (const p of players) {
          const hex = Number.isInteger(p.color) ? `#${p.color.toString(16).padStart(6, '0')}` : '#fff';
          const row = el('div', { textContent: `${p.name}${p.id === conn.host ? ' (Host)' : ''}${p.connected ? '' : ' (getrennt)'}` }, `color:${hex}`);
          list.appendChild(row);
        }
      };
      draw(conn.roster);
      const start = el('button', { textContent: 'Spiel starten' }, 'font:inherit;margin-right:8px');
      const hint = el('div', { textContent: 'Warte auf den Host…' }, 'color:#aaa');
      const leave = el('button', { textContent: 'Verlassen' }, 'font:inherit');
      const refresh = () => {
        draw(conn.roster);
        start.style.display = conn.isHost() ? 'inline-block' : 'none';
        hint.style.display = conn.isHost() ? 'none' : 'block';
        start.disabled = conn.roster.filter((p) => p.connected).length < 2;
      };
      start.onclick = () => conn.requestStart();
      leave.onclick = () => {
        safeRemove(TOKEN_KEY(conn.room));
        finish(null);
      };
      box.append(list, start, hint, leave, message);
      conn.onLobby = refresh;
      refresh();
    };

    conn.onJoined = () => {
      safeSet(TOKEN_KEY(conn.room), conn.token);
      showError('');
      renderLobby();
    };

    renderEntry();
  });
}
