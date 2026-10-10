import type { ChatMessage, ErrorCode, RosterEntry, RoomVisibility } from '@pfandraiders/core';
import {
  defaultRoomName,
  MAX_CHAT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_ROOM_NAME_LENGTH,
  ROOM_CODE_LENGTH,
  ROUND_MS_CHOICES,
  ROUNDS_CHOICES,
  stepMapId,
} from '@pfandraiders/core';
import { AVATAR_COLUMNS, avatarCells, stepAvatar, takenByOthers } from './avatarGrid';
import { sfx } from './sfx';
import { buildLabel, currentBuild, versionMismatch } from './buildInfo';
import { CHARACTER_URLS } from './characterAssets';
import { chatColorHex, rosterDiff } from './chatLogic';
import { createRequest, nextTab, parseTab, sanitizeRoomCode, shouldReportClose, TAB_LABELS, TABS } from './onlineMenuLogic';
import type { MenuTab } from './onlineMenuLogic';
import { OnlineConnection } from './online';
import { ALL_CHARACTERS, CHAR_FRAME_H, CHAR_FRAME_W } from './playerChars';
import { EMPTY_ROOM_LIST_TEXT, firstSelectable, listAction, moveSelection, refreshAllowed, ROOM_LIST_HEADER, roomRows } from './roomList';
import { roundMsLabel, roundsLabel } from './roundTime';
import { loadAvatarWish, saveAvatarWish } from './settings';
import { buildJoinLink, copyText } from './shareLink';
import type { SocketFactory } from './online';

const TOKEN_KEY = (room: string) => `pfandraiders.token.${room}`;
const NAME_KEY = 'pfandraiders.name';
const TAB_KEY = 'pfandraiders.menuTab';
const LAST_ROOM_KEY = 'pfandraiders.lastRoom';

function localGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* egal */
  }
}

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
  chat_too_fast: 'Zu schnell.',
  chat_closed: 'Chat gibt es nur in der Lobby.',
  wrong_phase: 'Das geht gerade nicht.',
  cannot_buy: 'Kauf abgelehnt.',
  wrong_password: 'Passwort falsch oder nötig.',
  avatar_taken: 'Die Figur ist schon vergeben.',
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
 * Erstes Bild eines Figurenbogens (vorn, Stand: Spalte 0, Zeile 0) als Pixelgrafik.
 * Bögen haben 4 x 3 Bilder zu CHAR_FRAME_W x CHAR_FRAME_H px.
 */
function avatarSprite(index: number, scale: number): HTMLDivElement {
  const key = ALL_CHARACTERS[index] ?? ALL_CHARACTERS[0];
  const d = el(
    'div',
    {},
    `width:${CHAR_FRAME_W * scale}px;height:${CHAR_FRAME_H * scale}px;flex:none;background-repeat:no-repeat;background-position:0 0;background-size:${CHAR_FRAME_W * 4 * scale}px ${CHAR_FRAME_H * 3 * scale}px;image-rendering:pixelated`,
  );
  const src = CHARACTER_URLS[key];
  if (src) d.style.backgroundImage = `url("${src}")`;
  return d;
}

/**
 * Zeigt ein Overlay zum Erstellen, Betreten oder Auswählen eines Raums und die Lobby.
 * Löst mit der Verbindung auf, sobald der Server die Runde startet, ein Rückkehrer im Shop landet oder die
 * Endwertung läuft. Löst mit null auf, wenn abgebrochen wird.
 * `joinCode` (aus einem Teilen-Link): Dialog öffnet auf "Beitreten" mit diesem Raumcode.
 * `resume`: bestehende Verbindung (nach der Endwertung zurück in der Lobby); zeigt direkt die Lobby.
 */
export function showOnlineMenu(
  url: string,
  socketFactory: SocketFactory = (u) => new WebSocket(u) as unknown as ReturnType<SocketFactory>,
  opts: { joinCode?: string; resume?: OnlineConnection } = {},
): Promise<OnlineConnection | null> {
  return new Promise((resolve) => {
    const root = el('div', {}, 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);color:#fff;font:16px monospace;z-index:10');
    const box = el('div', {}, 'background:#222;padding:20px;border:2px solid #888;width:520px;min-height:340px;max-width:90vw;max-height:90vh;overflow:auto;box-sizing:border-box');
    root.appendChild(box);
    // Phaser hängt am window und verschluckt gefangene Tasten (E, O, Leertaste ...), also hier stoppen
    for (const type of ['keydown', 'keyup', 'keypress']) root.addEventListener(type, (e) => e.stopPropagation());
    document.body.appendChild(root);

    const conn = opts.resume ?? new OnlineConnection(url, socketFactory);
    // Lobby, Chat und Fehler klingen über die ganze Verbindung (auch später im Spiel und im Shop)
    conn.sound = (id) => sfx.play(id);
    let finished = false;
    const finish = (result: OnlineConnection | null) => {
      if (finished) return;
      finished = true;
      conn.onStart = null;
      conn.onClosed = null;
      conn.onError = null;
      conn.onLobby = null;
      conn.onJoined = null;
      conn.onChat = null;
      conn.onShopState = null;
      conn.onPhase = null;
      conn.onRooms = null;
      root.remove();
      if (result === null) conn.close();
      resolve(result);
    };

    const message = el('div', {}, 'color:#ff8a80;min-height:1.2em;margin-top:8px');
    const showError = (text: string) => {
      message.textContent = text;
      if (text) sfx.play('error');
    };
    /** Selbst gewählte Figur, bis die Lobby sie bestätigt (dann wird sie als Wunsch gemerkt) */
    let pendingWish: number | null = null;
    conn.onError = (code, text) => {
      if (code === 'avatar_taken') pendingWish = null;
      showError(ERRORS[code] ?? text);
    };
    conn.onClosed = () => {
      // Ohne Raum schließt der Server ein ungenutztes Socket nach 30 s; die nächste Aktion verbindet neu
      if (shouldReportClose(conn.room)) showError('Verbindung zum Server verloren.');
    };
    conn.onStart = () => finish(conn);
    // Rückkehr oder Beitritt zwischen zwei Runden: direkt in den Shop
    conn.onShopState = () => {
      if (conn.roomPhase === 'shop') finish(conn);
    };
    // Beitritt oder Rückkehr während der Endwertung: zur Endwertung
    conn.onPhase = () => {
      if (conn.roomPhase === 'final') finish(conn);
    };

    // Name und Code bleiben beim Tabwechsel erhalten
    const form = {
      name: safeGet(NAME_KEY) ?? '',
      code: '',
      tab: parseTab(localGet(TAB_KEY)),
      roomName: '',
      visibility: 'public' as RoomVisibility,
      createPassword: '',
      joinPassword: '',
    };
    /** Raumliste: gewählte Zeile, letzte Anfrage, schon eine Antwort da, offene Passwortabfrage */
    const list = { selected: -1, lastRefresh: -Infinity, loaded: false, prompt: null as { code: string; name: string } | null, password: '' };
    const lastRoom = sanitizeRoomCode(localGet(LAST_ROOM_KEY) ?? '');
    if (lastRoom.length === ROOM_CODE_LENGTH && safeGet(TOKEN_KEY(lastRoom))) form.code = lastRoom;
    const linkCode = sanitizeRoomCode(opts.joinCode ?? '');
    if (linkCode.length === ROOM_CODE_LENGTH) {
      form.tab = 'join'; // nur für diesen Aufruf, der gespeicherte Tab bleibt
      form.code = linkCode;
    }

    /** Verbindung aufbauen, falls keine offen ist (auch nach dem Leerlauf-Schließen ohne Raum). */
    const connectIfNeeded = (): boolean => {
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
    const need = () => {
      if (form.name.trim().length === 0) {
        showError('Bitte einen Namen eingeben.');
        return false;
      }
      safeSet(NAME_KEY, form.name.trim(), true);
      return connectIfNeeded();
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

    const doCreate = () => {
      sfx.play('ui_select');
      const req = createRequest({ roomName: form.roomName, visibility: form.visibility, password: form.createPassword });
      if (!req.ok) return showError(req.error);
      if (need()) whenOpen(() => conn.create(form.name.trim(), { ...req.value, avatar: loadAvatarWish() }));
    };
    const doJoin = (rawCode: string, password: string) => {
      sfx.play('ui_select');
      const room = sanitizeRoomCode(rawCode);
      if (room.length !== ROOM_CODE_LENGTH) return showError('Bitte einen Raumcode eingeben.');
      if (!need()) return;
      const token = safeGet(TOKEN_KEY(room)) ?? undefined;
      whenOpen(() => conn.join(room, form.name.trim(), token, { password: password.trim() || undefined, avatar: loadAvatarWish() }));
    };
    /** Liste neu laden (höchstens einmal pro Sekunde); die Antwort zeichnet drawList. */
    let drawList: (() => void) | null = null;
    const refreshList = () => {
      const now = Date.now();
      if (!refreshAllowed(list.lastRefresh, now)) return;
      list.lastRefresh = now;
      if (!connectIfNeeded()) return;
      whenOpen(() => conn.listRooms());
    };
    conn.onRooms = () => {
      list.loaded = true;
      drawList?.();
    };

    const fieldStyle = 'width:100%;box-sizing:border-box;margin-bottom:8px;font:inherit';
    const labelStyle = 'color:#aaa;font-size:14px;margin-bottom:4px';
    const renderEntry = (focusTab = false) => {
      drawList = null;
      box.replaceChildren();
      box.appendChild(el('div', { textContent: 'Online spielen' }, 'font-size:22px;margin-bottom:8px'));
      box.appendChild(el('div', { textContent: `Server: ${url}` }, 'color:#aaa;font-size:14px;margin-bottom:10px'));

      // Name gilt für alle Tabs (auch für die Raumliste)
      const name = el('input', { placeholder: 'Dein Name', maxLength: MAX_NAME_LENGTH, value: form.name }, fieldStyle);
      name.setAttribute('aria-label', 'Dein Name');
      box.append(el('div', { textContent: 'Dein Name' }, labelStyle), name);

      const tabBar = el('div', { role: 'tablist' }, 'display:flex;margin-bottom:12px;border-bottom:1px solid #555');
      const tabButtons = new Map<MenuTab, HTMLButtonElement>();
      for (const id of TABS) {
        const active = form.tab === id;
        const b = el(
          'button',
          { textContent: TAB_LABELS[id], role: 'tab', tabIndex: active ? 0 : -1 },
          `flex:1 1 0;min-width:0;font:inherit;color:${active ? '#fff' : '#999'};background:${active ? '#333' : '#1a1a1a'};border:0;border-bottom:3px solid ${active ? '#ffca28' : 'transparent'};padding:8px 6px;cursor:pointer`,
        );
        b.setAttribute('aria-selected', String(active));
        b.onclick = () => switchTab(id, false);
        b.onkeydown = (e) => {
          const next = nextTab(id, e.key);
          if (next === id) return;
          e.preventDefault();
          switchTab(next, true);
        };
        tabButtons.set(id, b);
        tabBar.appendChild(b);
      }
      box.appendChild(tabBar);

      const cancel = el('button', { textContent: 'Abbrechen' }, 'font:inherit');
      cancel.onclick = () => {
        sfx.play('ui_back');
        finish(null);
      };

      if (form.tab === 'host') {
        const roomName = el('input', { maxLength: MAX_ROOM_NAME_LENGTH, value: form.roomName }, fieldStyle);
        roomName.setAttribute('aria-label', 'Raumname');
        const placeholder = () => (roomName.placeholder = form.name.trim() ? defaultRoomName(form.name.trim()) : 'Raumname (optional)');
        placeholder();
        roomName.oninput = () => {
          form.roomName = roomName.value;
        };
        const visButton = el('button', {}, 'font:inherit;margin-right:8px');
        const visHint = el('span', {}, 'color:#aaa;font-size:14px');
        const drawVis = () => {
          visButton.textContent = form.visibility === 'public' ? 'Öffentlich' : 'Privat';
          visButton.setAttribute('aria-pressed', String(form.visibility === 'private'));
          visHint.textContent = form.visibility === 'public' ? 'In der Raumliste sichtbar.' : 'Nur mit Code oder Link.';
        };
        drawVis();
        visButton.onclick = () => {
          form.visibility = form.visibility === 'public' ? 'private' : 'public';
          drawVis();
        };
        const password = el('input', { type: 'password', placeholder: 'Passwort (optional)', maxLength: MAX_PASSWORD_LENGTH, value: form.createPassword }, fieldStyle);
        password.setAttribute('aria-label', 'Passwort');
        password.autocomplete = 'off';
        password.oninput = () => {
          form.createPassword = password.value;
        };
        const create = el('button', { textContent: 'Raum erstellen' }, 'font:inherit;margin-right:8px');
        create.onclick = doCreate;
        name.oninput = () => {
          form.name = name.value;
          placeholder();
        };
        for (const input of [name, roomName, password]) {
          input.onkeydown = (e) => {
            if (e.key === 'Enter') create.click();
          };
        }
        const visRow = el('div', {}, 'margin-bottom:8px');
        visRow.append(visButton, visHint);
        box.append(
          el('div', { textContent: 'Du wirst Host und bekommst einen Raumcode.' }, 'color:#aaa;font-size:14px;margin-bottom:8px'),
          el('div', { textContent: 'Raumname' }, labelStyle),
          roomName,
          el('div', { textContent: 'Sichtbarkeit' }, labelStyle),
          visRow,
          el('div', { textContent: 'Passwort' }, labelStyle),
          password,
          create,
          cancel,
          message,
        );
        if (focusTab) tabButtons.get('host')?.focus();
        else (name.value.trim() === '' ? name : roomName).focus();
        return;
      }

      name.oninput = () => {
        form.name = name.value;
      };

      if (form.tab === 'join') {
        const code = el('input', { placeholder: 'Raumcode', maxLength: ROOM_CODE_LENGTH, value: form.code }, `${fieldStyle};text-transform:uppercase`);
        code.setAttribute('aria-label', 'Raumcode');
        code.oninput = () => {
          code.value = sanitizeRoomCode(code.value);
          form.code = code.value;
        };
        const password = el('input', { type: 'password', placeholder: 'Passwort (optional)', maxLength: MAX_PASSWORD_LENGTH, value: form.joinPassword }, fieldStyle);
        password.setAttribute('aria-label', 'Passwort');
        password.autocomplete = 'off';
        password.oninput = () => {
          form.joinPassword = password.value;
        };
        const join = el('button', { textContent: 'Beitreten' }, 'font:inherit;margin-right:8px');
        join.onclick = () => doJoin(form.code, form.joinPassword);
        name.onkeydown = (e) => {
          if (e.key !== 'Enter') return;
          if (sanitizeRoomCode(code.value).length === 0) code.focus();
          else join.click();
        };
        for (const input of [code, password]) {
          input.onkeydown = (e) => {
            if (e.key === 'Enter') join.click();
          };
        }
        box.append(
          el('div', { textContent: 'Raumcode' }, labelStyle),
          code,
          el('div', { textContent: 'Passwort (leer lassen, wenn der Raum keins hat)' }, labelStyle),
          password,
          join,
          cancel,
          message,
        );
        if (focusTab) tabButtons.get('join')?.focus();
        else (name.value.trim() === '' ? name : code).focus();
        return;
      }

      // Raumliste
      const cols = 'grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) minmax(0,1.3fr) 4em 4.5em';
      const header = el('div', {}, `display:grid;${cols};gap:6px;padding:2px 4px;color:#aaa;font-size:14px;border-bottom:1px solid #555`);
      for (const text of ROOM_LIST_HEADER) header.appendChild(el('span', { textContent: text }));
      const listBox = el('div', { tabIndex: 0 }, 'height:180px;max-height:30vh;overflow-y:auto;background:#111;border:1px solid #555;margin-bottom:8px;outline:none;font-size:14px');
      listBox.setAttribute('role', 'listbox');
      listBox.setAttribute('aria-label', 'Öffentliche Räume');
      const promptArea = el('div', {}, 'margin-bottom:8px');
      const refresh = el('button', { textContent: 'Aktualisieren (R)' }, 'font:inherit;margin-right:8px');
      refresh.onclick = refreshList;

      const rows = () => roomRows(conn.rooms);
      const choose = (i: number) => {
        const action = listAction(rows()[i]);
        if (!action) return;
        if (action.kind === 'join') {
          list.prompt = null;
          doJoin(action.code, '');
          return;
        }
        list.prompt = { code: action.code, name: action.name };
        list.password = '';
        drawList?.();
      };
      drawList = () => {
        const all = rows();
        if (list.selected >= all.length || (list.selected >= 0 && !all[list.selected].joinable) || list.selected < 0) {
          list.selected = firstSelectable(all);
        }
        listBox.replaceChildren();
        if (all.length === 0) {
          listBox.appendChild(el('div', { textContent: list.loaded ? EMPTY_ROOM_LIST_TEXT : 'Lade…' }, 'color:#888;padding:4px'));
        }
        all.forEach((r, i) => {
          const sel = i === list.selected;
          const line = el(
            'div',
            {},
            `display:grid;${cols};gap:6px;padding:3px 4px;color:${r.joinable ? '#fff' : '#666'};background:${sel ? '#333' : 'transparent'};cursor:${r.joinable ? 'pointer' : 'default'}`,
          );
          line.setAttribute('role', 'option');
          line.setAttribute('aria-selected', String(sel));
          line.setAttribute('aria-disabled', String(!r.joinable));
          for (const text of [`${r.locked ? '🔒 ' : ''}${r.name}`, r.map, r.host, r.players, r.status]) {
            line.appendChild(el('span', { textContent: text }, 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'));
          }
          if (r.joinable) {
            line.onclick = () => {
              list.selected = i;
              choose(i);
            };
          }
          listBox.appendChild(line);
        });
        promptArea.replaceChildren();
        const prompt = list.prompt;
        if (prompt) {
          const pw = el('input', { type: 'password', placeholder: 'Passwort', maxLength: MAX_PASSWORD_LENGTH, value: list.password }, fieldStyle);
          pw.setAttribute('aria-label', `Passwort für ${prompt.name}`);
          pw.autocomplete = 'off';
          pw.oninput = () => {
            list.password = pw.value;
          };
          const go = el('button', { textContent: 'Beitreten' }, 'font:inherit;margin-right:8px');
          go.onclick = () => doJoin(prompt.code, list.password);
          const back = el('button', { textContent: 'Zurück' }, 'font:inherit');
          back.onclick = () => {
            sfx.play('ui_back');
            list.prompt = null;
            drawList?.();
            listBox.focus();
          };
          pw.onkeydown = (e) => {
            if (e.key === 'Enter') go.click();
            if (e.key === 'Escape') back.click();
          };
          promptArea.append(el('div', { textContent: `Passwort für „${prompt.name}“` }, labelStyle), pw, go, back);
          pw.focus();
        }
      };
      listBox.onkeydown = (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const before = list.selected;
          list.selected = moveSelection(rows(), list.selected, e.key === 'ArrowDown' ? 1 : -1);
          if (list.selected !== before) sfx.play('ui_move');
          drawList?.();
          listBox.children[list.selected]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          e.preventDefault();
          choose(list.selected);
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          refreshList();
        }
      };
      box.append(
        el('div', { textContent: 'Öffentliche Räume. Graue Räume laufen schon oder sind voll.' }, 'color:#aaa;font-size:14px;margin-bottom:6px'),
        header,
        listBox,
        promptArea,
        refresh,
        cancel,
        message,
      );
      drawList?.();
      refreshList();
      if (focusTab) tabButtons.get('list')?.focus();
      else listBox.focus();
    };

    const switchTab = (tab: MenuTab, viaKeyboard: boolean) => {
      if (tab === form.tab) return;
      sfx.play('ui_move');
      form.tab = tab;
      localSet(TAB_KEY, tab);
      showError('');
      renderEntry(viaKeyboard);
    };

    const renderLobby = () => {
      // Eine späte Antwort auf die Raumliste soll die Lobby nicht mehr anfassen
      drawList = null;
      box.replaceChildren();
      const title = el('div', {}, 'font-size:24px;margin-bottom:2px;overflow-wrap:anywhere');
      const codeLine = el('div', {}, 'color:#ccc;font-size:15px;margin-bottom:4px');
      box.append(title, codeLine);
      box.appendChild(el('div', { textContent: 'Code oder Link weitergeben, damit Freunde beitreten.' }, 'color:#aaa;font-size:14px;margin-bottom:4px'));
      // Teilen-Link: <Adresse>?join=CODE (ein ?server= bleibt erhalten, ein Passwort nie); "Kopiert!" verschwindet nach kurzer Zeit
      const shareRow = el('div', {}, 'margin-bottom:6px;font-size:14px');
      const copyButton = el('button', { textContent: 'Link kopieren' }, 'font:inherit;margin-right:8px');
      const copyStatus = el('span', { textContent: '' }, 'color:#a5d6a7;overflow-wrap:anywhere');
      let copyTimer: ReturnType<typeof setTimeout> | null = null;
      copyButton.onclick = () => {
        const link = buildJoinLink(window.location.href, conn.room);
        void copyText(link).then((ok) => {
          if (copyTimer !== null) clearTimeout(copyTimer);
          copyStatus.style.color = ok ? '#a5d6a7' : '#ffa726';
          copyStatus.textContent = ok ? 'Kopiert!' : `Kopieren ging nicht: ${link}`;
          copyTimer = ok ? setTimeout(() => (copyStatus.textContent = ''), 2000) : null;
        });
      };
      shareRow.append(copyButton, copyStatus);
      box.appendChild(shareRow);
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

      // Spielerliste mit Figur, Farbe und Host-Markierung
      const players = el('div', {}, 'margin:6px 0 10px');
      const drawPlayers = (list: RosterEntry[]) => {
        players.replaceChildren();
        for (const p of list) {
          const row = el('div', {}, 'display:flex;align-items:center;gap:6px;margin-bottom:2px');
          row.appendChild(avatarSprite(p.avatar, 1));
          const label = el('span', { textContent: `${p.name}${p.id === conn.host ? ' (Host)' : ''}${p.connected ? '' : ' (getrennt)'}` });
          label.style.color = chatColorHex(p.color);
          if (p.id === conn.you) label.style.fontWeight = 'bold';
          row.appendChild(label);
          players.appendChild(row);
        }
      };

      // Figurauswahl: Raster 8 x 3, vergebene halbdurchsichtig, eigene gelb umrandet; Pfeile oder Klick
      const CELL = CHAR_FRAME_W * 2 + 6;
      const grid = el('div', { tabIndex: 0 }, `display:grid;grid-template-columns:repeat(${AVATAR_COLUMNS}, ${CELL}px);gap:4px;margin-bottom:10px;outline:none`);
      grid.setAttribute('role', 'listbox');
      grid.setAttribute('aria-label', 'Figur wählen (Pfeiltasten oder Klick)');
      const choose = (avatar: number) => {
        sfx.play('avatar_pick');
        pendingWish = avatar;
        conn.setAvatar(avatar);
      };
      const drawGrid = () => {
        grid.replaceChildren();
        for (const cell of avatarCells(conn.roster, conn.you)) {
          const b = el(
            'div',
            { title: cell.takenBy ? `vergeben an ${cell.takenBy}` : cell.own ? 'deine Figur' : 'frei' },
            `height:${CHAR_FRAME_H * 2 + 6}px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:2px solid ${cell.own ? '#ffca28' : '#333'};background:${cell.own ? '#3a3320' : '#1a1a1a'};opacity:${cell.taken ? 0.3 : 1};cursor:${cell.taken || cell.own ? 'default' : 'pointer'}`,
          );
          b.setAttribute('role', 'option');
          b.setAttribute('aria-selected', String(cell.own));
          b.setAttribute('aria-disabled', String(cell.taken));
          b.appendChild(avatarSprite(cell.index, 2));
          if (!cell.taken && !cell.own) b.onclick = () => choose(cell.index);
          grid.appendChild(b);
        }
      };
      grid.onkeydown = (e) => {
        const own = conn.ownAvatar();
        if (own === null) return;
        const next = stepAvatar(own, e.key, takenByOthers(conn.roster, conn.you));
        if (e.key.startsWith('Arrow')) e.preventDefault();
        if (next !== own) choose(next);
      };

      // Chat: unverändert (Nachrichten vom Server und Systemzeilen; nur Textknoten, nie HTML)
      const chatLog = el('div', { role: 'log' }, 'height:120px;max-height:20vh;overflow-y:auto;background:#111;border:1px solid #555;padding:4px 6px;font-size:14px;margin-bottom:6px;overflow-wrap:anywhere');
      chatLog.setAttribute('aria-label', 'Chat');
      const chatInput = el('input', { placeholder: 'Nachricht…', maxLength: MAX_CHAT_LENGTH }, 'width:100%;box-sizing:border-box;margin-bottom:10px;font:inherit');
      chatInput.setAttribute('aria-label', 'Chatnachricht');
      const shown = new WeakSet<ChatMessage>();
      const MAX_LINES = 80;
      const append = (line: HTMLElement) => {
        const atBottom = chatLog.scrollTop + chatLog.clientHeight >= chatLog.scrollHeight - 4;
        chatLog.appendChild(line);
        while (chatLog.childElementCount > MAX_LINES) chatLog.firstElementChild?.remove();
        if (atBottom) chatLog.scrollTop = chatLog.scrollHeight;
      };
      const chatLine = (m: ChatMessage) => {
        const line = el('div');
        const who = el('span', { textContent: m.name });
        who.style.color = chatColorHex(m.color);
        if (m.id === conn.you) who.style.fontWeight = 'bold';
        line.append(who, document.createTextNode(`: ${m.text}`));
        return line;
      };
      const systemLine = (text: string) => el('div', { textContent: text }, 'color:#888;font-style:italic');
      const showChat = () => {
        for (const m of conn.chat) {
          if (shown.has(m)) continue;
          shown.add(m);
          append(chatLine(m));
        }
      };
      showChat();
      chatInput.onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const text = chatInput.value;
        if (text.trim().length === 0) return;
        conn.sendChat(text);
        sfx.play('chat_send');
        chatInput.value = '';
      };
      conn.onChat = showChat;

      // Host: Karte mit ◄ ► (oder Pfeiltasten links/rechts auf der Zeile) wechseln; Gäste sehen nur den Namen
      const mapRow = el('div', {}, 'margin-bottom:6px');
      const mapPrev = el('button', { textContent: '◄' }, 'font:inherit;margin-left:6px');
      const mapText = el('span', { textContent: '' }, 'display:inline-block;min-width:12em;text-align:center');
      const mapNext = el('button', { textContent: '►' }, 'font:inherit');
      mapPrev.setAttribute('aria-label', 'Vorige Karte');
      mapNext.setAttribute('aria-label', 'Nächste Karte');
      const stepMap = (dir: -1 | 1) => {
        if (!conn.isHost()) return;
        sfx.play('ui_move');
        conn.setMap(stepMapId(conn.lobbyMapId, dir));
      };
      mapPrev.onclick = () => stepMap(-1);
      mapNext.onclick = () => stepMap(1);
      mapRow.onkeydown = (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        stepMap(e.key === 'ArrowLeft' ? -1 : 1);
      };
      mapRow.append(el('span', { textContent: 'Karte:' }), mapPrev, mapText, mapNext);

      // Host: Rundenzeit und Rundenzahl; Gäste sehen die Werte
      const roundRow = el('div', {}, 'margin-bottom:6px');
      const roundText = el('span', { textContent: '' });
      const roundSelect = el('select', {}, 'font:inherit;margin-left:6px');
      for (const ms of ROUND_MS_CHOICES) roundSelect.appendChild(el('option', { value: String(ms), textContent: roundMsLabel(ms) }));
      roundSelect.onchange = () => conn.setRoundMs(Number(roundSelect.value));
      roundRow.append(el('span', { textContent: 'Rundenzeit:' }), roundSelect, roundText);
      const roundsRow = el('div', {}, 'margin-bottom:10px');
      const roundsText = el('span', { textContent: '' });
      const roundsSelect = el('select', {}, 'font:inherit;margin-left:6px');
      for (const n of ROUNDS_CHOICES) roundsSelect.appendChild(el('option', { value: String(n), textContent: roundsLabel(n) }));
      roundsSelect.onchange = () => conn.setRounds(Number(roundsSelect.value));
      roundsRow.append(el('span', { textContent: 'Runden:' }), roundsSelect, roundsText);

      const start = el('button', { textContent: 'Spiel starten' }, 'font:inherit;margin-right:8px');
      const hint = el('div', { textContent: 'Warte auf den Host…' }, 'color:#aaa');
      const leave = el('button', { textContent: 'Verlassen' }, 'font:inherit');
      const refresh = () => {
        title.textContent = conn.roomName || `Raum ${conn.room}`;
        codeLine.textContent = `Code ${conn.room}${conn.locked ? '   🔒 Passwort' : ''}${conn.visibility === 'private' ? '   privat' : ''}`;
        drawPlayers(conn.roster);
        drawGrid();
        const host = conn.isHost();
        mapPrev.style.display = host ? 'inline-block' : 'none';
        mapNext.style.display = host ? 'inline-block' : 'none';
        mapText.textContent = conn.lobbyMapName;
        mapText.style.textAlign = host ? 'center' : 'left';
        // Gäste: ohne ◄ fehlt dessen Abstand
        mapText.style.marginLeft = host ? '0' : '6px';
        start.style.display = host ? 'inline-block' : 'none';
        hint.style.display = host ? 'none' : 'block';
        start.disabled = conn.roster.filter((p) => p.connected).length < 2;
        roundSelect.style.display = host ? 'inline-block' : 'none';
        roundSelect.value = String(conn.roundMs);
        roundText.textContent = host ? '' : ` ${roundMsLabel(conn.roundMs)}`;
        roundsSelect.style.display = host ? 'inline-block' : 'none';
        roundsSelect.value = String(conn.rounds);
        roundsText.textContent = host ? '' : ` ${roundsLabel(conn.rounds)}`;
      };
      // Die erste Spielerliste nach dem Beitritt wird nicht gemeldet
      let prevRoster: RosterEntry[] | null = null;
      const onLobby = () => {
        for (const text of rosterDiff(prevRoster, conn.roster)) append(systemLine(text));
        prevRoster = [...conn.roster];
        // Selbst gewählte Figur bestätigt: als Wunsch für das nächste Mal merken
        const own = conn.ownAvatar();
        if (pendingWish !== null && own === pendingWish) {
          saveAvatarWish(own);
          pendingWish = null;
        }
        refresh();
      };
      start.onclick = () => {
        sfx.play('ui_select');
        conn.requestStart();
      };
      leave.onclick = () => {
        sfx.play('ui_back');
        safeRemove(TOKEN_KEY(conn.room));
        finish(null);
      };
      box.append(
        players,
        el('div', { textContent: 'Deine Figur' }, 'color:#aaa;font-size:14px;margin-bottom:4px'),
        grid,
        chatLog,
        chatInput,
        mapRow,
        roundRow,
        roundsRow,
        start,
        hint,
        leave,
        message,
      );
      conn.onLobby = onLobby;
      refresh();
    };

    conn.onJoined = () => {
      safeSet(TOKEN_KEY(conn.room), conn.token);
      localSet(LAST_ROOM_KEY, conn.room);
      showError('');
      renderLobby();
    };

    // Zurück aus der Endwertung: dieselbe Verbindung, gleich die Lobby (der Chat liegt schon in conn.chat)
    if (opts.resume) renderLobby();
    else renderEntry();
  });
}
