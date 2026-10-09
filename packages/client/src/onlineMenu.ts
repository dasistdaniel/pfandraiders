import type { ChatMessage, ErrorCode, RosterEntry } from '@pfandraiders/core';
import { buildLabel, currentBuild, versionMismatch } from './buildInfo';
import { MAX_CHAT_LENGTH, ROOM_CODE_LENGTH, ROUND_MS_CHOICES } from '@pfandraiders/core';
import { chatColorHex, rosterDiff } from './chatLogic';
import { nextTab, parseTab, sanitizeRoomCode, TAB_LABELS } from './onlineMenuLogic';
import type { MenuTab } from './onlineMenuLogic';
import { OnlineConnection } from './online';
import { roundMsLabel } from './roundTime';
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
 * Zeigt ein Overlay zum Erstellen oder Betreten eines Raums und die Spielerliste.
 * Löst mit der Verbindung auf, sobald der Server die Runde startet. Löst mit null auf, wenn abgebrochen wird.
 * `joinCode` (aus einem Teilen-Link): Dialog öffnet auf "Beitreten" mit diesem Raumcode, den Namen tippt man selbst.
 */
export function showOnlineMenu(
  url: string,
  socketFactory: SocketFactory = (u) => new WebSocket(u) as unknown as ReturnType<SocketFactory>,
  opts: { joinCode?: string } = {},
): Promise<OnlineConnection | null> {
  return new Promise((resolve) => {
    const root = el('div', {}, 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);color:#fff;font:16px monospace;z-index:10');
    const box = el('div', {}, 'background:#222;padding:20px;border:2px solid #888;width:440px;min-height:340px;max-width:90vw;max-height:90vh;overflow:auto;box-sizing:border-box');
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
      conn.onChat = null;
      conn.onShopState = null;
      conn.onPhase = null;
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
    // Rückkehr oder Beitritt zwischen zwei Runden: direkt in den Shop
    conn.onShopState = () => {
      if (conn.roomPhase === 'shop') finish(conn);
    };

    // Name und Code bleiben beim Tabwechsel erhalten
    const form = { name: safeGet(NAME_KEY) ?? '', code: '', tab: parseTab(localGet(TAB_KEY)) };
    const lastRoom = sanitizeRoomCode(localGet(LAST_ROOM_KEY) ?? '');
    if (lastRoom.length === ROOM_CODE_LENGTH && safeGet(TOKEN_KEY(lastRoom))) form.code = lastRoom;
    const linkCode = sanitizeRoomCode(opts.joinCode ?? '');
    if (linkCode.length === ROOM_CODE_LENGTH) {
      form.tab = 'join'; // nur für diesen Aufruf, der gespeicherte Tab bleibt
      form.code = linkCode;
    }

    const need = () => {
      if (form.name.trim().length === 0) {
        showError('Bitte einen Namen eingeben.');
        return false;
      }
      safeSet(NAME_KEY, form.name.trim(), true);
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

    const renderEntry = (focusTab = false) => {
      box.replaceChildren();
      box.appendChild(el('div', { textContent: 'Online spielen' }, 'font-size:22px;margin-bottom:8px'));
      box.appendChild(el('div', { textContent: `Server: ${url}` }, 'color:#aaa;font-size:14px;margin-bottom:10px'));

      const tabBar = el('div', { role: 'tablist' }, 'display:flex;margin-bottom:12px;border-bottom:1px solid #555');
      const tabButtons = new Map<MenuTab, HTMLButtonElement>();
      const tabLabels = TAB_LABELS;
      for (const id of ['host', 'join'] as MenuTab[]) {
        const active = form.tab === id;
        const b = el(
          'button',
          { textContent: tabLabels[id], role: 'tab', tabIndex: active ? 0 : -1 },
          `flex:1 1 0;min-width:0;font:inherit;color:${active ? '#fff' : '#999'};background:${active ? '#333' : '#1a1a1a'};border:0;border-bottom:3px solid ${active ? '#ffca28' : 'transparent'};padding:8px 12px;cursor:pointer`,
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

      const name = el('input', { placeholder: 'Dein Name', maxLength: 16, value: form.name }, 'width:100%;box-sizing:border-box;margin-bottom:8px;font:inherit');
      name.setAttribute('aria-label', 'Dein Name');
      name.oninput = () => {
        form.name = name.value;
      };
      const cancel = el('button', { textContent: 'Abbrechen' }, 'font:inherit');
      cancel.onclick = () => finish(null);
      const nameLabel = el('div', { textContent: 'Dein Name' }, 'color:#aaa;font-size:14px;margin-bottom:4px');

      if (form.tab === 'host') {
        const create = el('button', { textContent: 'Raum erstellen' }, 'font:inherit;margin-right:8px');
        create.onclick = () => {
          if (need()) whenOpen(() => conn.create(form.name.trim()));
        };
        name.onkeydown = (e) => {
          if (e.key === 'Enter') create.click();
        };
        box.append(el('div', { textContent: 'Du wirst Host und bekommst einen Raumcode.' }, 'color:#aaa;font-size:14px;margin-bottom:10px'), nameLabel, name, create, cancel, message);
        if (focusTab) tabButtons.get('host')?.focus();
        else name.focus();
        return;
      }

      const code = el('input', { placeholder: 'Raumcode', maxLength: ROOM_CODE_LENGTH, value: form.code }, 'width:100%;box-sizing:border-box;margin-bottom:8px;font:inherit;text-transform:uppercase');
      code.setAttribute('aria-label', 'Raumcode');
      code.oninput = () => {
        code.value = sanitizeRoomCode(code.value);
        form.code = code.value;
      };
      const join = el('button', { textContent: 'Beitreten' }, 'font:inherit;margin-right:8px');
      join.onclick = () => {
        if (!need()) return;
        const room = sanitizeRoomCode(form.code);
        whenOpen(() => conn.join(room, form.name.trim(), safeGet(TOKEN_KEY(room)) ?? undefined));
      };
      name.onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        if (sanitizeRoomCode(code.value).length === 0) code.focus();
        else join.click();
      };
      code.onkeydown = (e) => {
        if (e.key === 'Enter') join.click();
      };
      box.append(nameLabel, name, el('div', { textContent: 'Raumcode' }, 'color:#aaa;font-size:14px;margin-bottom:4px'), code, join, cancel, message);
      if (focusTab) tabButtons.get('join')?.focus();
      else (name.value.trim() === '' ? name : code).focus();
    };

    const switchTab = (tab: MenuTab, viaKeyboard: boolean) => {
      if (tab === form.tab) return;
      form.tab = tab;
      localSet(TAB_KEY, tab);
      showError('');
      renderEntry(viaKeyboard);
    };

    const renderLobby = () => {
      box.replaceChildren();
      box.appendChild(el('div', { textContent: `Raum ${conn.room}` }, 'font-size:26px;letter-spacing:4px;margin-bottom:4px'));
      box.appendChild(el('div', { textContent: 'Code oder Link weitergeben, damit Freunde beitreten.' }, 'color:#aaa;font-size:14px;margin-bottom:4px'));
      // Teilen-Link: <Adresse>?join=CODE (ein ?server= bleibt erhalten); "Kopiert!" verschwindet nach kurzer Zeit
      const shareRow = el('div', {}, 'margin-bottom:6px;font-size:14px');
      const copyButton = el('button', { textContent: 'Link kopieren' }, 'font:inherit;margin-right:8px');
      const copyStatus = el('span', { textContent: '' }, 'color:#a5d6a7;overflow-wrap:anywhere');
      let copyTimer: ReturnType<typeof setTimeout> | null = null;
      copyButton.onclick = () => {
        const link = buildJoinLink(window.location.href, conn.room);
        void copyText(link).then((ok) => {
          if (copyTimer !== null) clearTimeout(copyTimer);
          copyStatus.style.color = ok ? '#a5d6a7' : '#ffa726';
          // Klappt das Kopieren nicht, steht der Link zum Abschreiben da (bleibt stehen)
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
      box.appendChild(el('div', {}, 'margin-bottom:6px'));
      const list = el('div', {}, 'margin-bottom:10px');
      const draw = (players: RosterEntry[]) => {
        list.replaceChildren();
        for (const p of players) {
          const row = el('div', { textContent: `${p.name}${p.id === conn.host ? ' (Host)' : ''}${p.connected ? '' : ' (getrennt)'}` });
          row.style.color = chatColorHex(p.color);
          list.appendChild(row);
        }
      };
      draw(conn.roster);

      // Chat: Nachrichten vom Server und Systemzeilen (Beitritt/Abgang aus dem Vergleich der Spielerlisten).
      // Alles nur per textContent/Textknoten, nie als HTML.
      const chatLog = el('div', { role: 'log' }, 'height:140px;max-height:22vh;overflow-y:auto;background:#111;border:1px solid #555;padding:4px 6px;font-size:14px;margin-bottom:6px;overflow-wrap:anywhere');
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
        chatInput.value = '';
      };
      conn.onChat = showChat;

      const roundRow = el('div', {}, 'margin-bottom:10px');
      const roundText = el('span', { textContent: '' });
      const roundSelect = el('select', {}, 'font:inherit;margin-left:6px');
      for (const ms of ROUND_MS_CHOICES) roundSelect.appendChild(el('option', { value: String(ms), textContent: roundMsLabel(ms) }));
      roundSelect.onchange = () => conn.setRoundMs(Number(roundSelect.value));
      roundRow.append(el('span', { textContent: 'Rundenzeit:' }), roundSelect, roundText);

      const start = el('button', { textContent: 'Spiel starten' }, 'font:inherit;margin-right:8px');
      const hint = el('div', { textContent: 'Warte auf den Host…' }, 'color:#aaa');
      const leave = el('button', { textContent: 'Verlassen' }, 'font:inherit');
      const refresh = () => {
        draw(conn.roster);
        start.style.display = conn.isHost() ? 'inline-block' : 'none';
        hint.style.display = conn.isHost() ? 'none' : 'block';
        start.disabled = conn.roster.filter((p) => p.connected).length < 2;
        roundSelect.style.display = conn.isHost() ? 'inline-block' : 'none';
        roundSelect.value = String(conn.roundMs);
        roundText.textContent = conn.isHost() ? '' : ` ${roundMsLabel(conn.roundMs)}`;
      };
      // Die erste Spielerliste nach dem Beitritt wird nicht gemeldet
      let prevRoster: RosterEntry[] | null = null;
      const onLobby = () => {
        for (const text of rosterDiff(prevRoster, conn.roster)) append(systemLine(text));
        prevRoster = [...conn.roster];
        refresh();
      };
      start.onclick = () => conn.requestStart();
      leave.onclick = () => {
        safeRemove(TOKEN_KEY(conn.room));
        finish(null);
      };
      box.append(list, chatLog, chatInput, roundRow, start, hint, leave, message);
      conn.onLobby = onLobby;
      refresh();
    };

    conn.onJoined = () => {
      safeSet(TOKEN_KEY(conn.room), conn.token);
      localSet(LAST_ROOM_KEY, conn.room);
      showError('');
      renderLobby();
    };

    renderEntry();
  });
}
