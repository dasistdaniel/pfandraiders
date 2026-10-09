import { defaultRoomName, ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import type { RoomVisibility } from '@pfandraiders/core';
import { SERVER_CONFIG } from './config';
import { Room } from './room';
import type { Conn, Member, Result, RoomOptions } from './room';

export interface ManagerOptions extends RoomOptions {
  maxRooms?: number;
  /** Wird bei jeder abgefangenen Ausnahme beim Ticken aufgerufen (Logging, Tests). */
  onError?: (err: unknown, room: Room) => void;
  maxTickFailures?: number;
}

/** Angaben aus der create-Nachricht (schon bereinigt) */
export interface CreateOptions {
  /** fehlt = defaultRoomName(name) */
  roomName?: string;
  /** fehlt = public */
  visibility?: RoomVisibility;
  /** fehlt = kein Passwort */
  password?: string;
  /** Wunschfigur des Erstellers */
  avatar?: number;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private readonly maxRooms: number;
  private readonly random: () => number;
  private readonly maxTickFailures: number;
  private failures = new Map<string, number>();

  constructor(private readonly opts: ManagerOptions = {}) {
    this.maxRooms = opts.maxRooms ?? SERVER_CONFIG.maxRooms;
    this.random = opts.random ?? Math.random;
    this.maxTickFailures = opts.maxTickFailures ?? SERVER_CONFIG.maxTickFailures;
  }

  get size(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_CHARS[Math.floor(this.random() * ROOM_CODE_CHARS.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  /** Neuer Raum, der Ersteller tritt als Host bei (mit seinem eigenen Passwort). */
  create(name: string, conn: Conn, opts: CreateOptions = {}): Result<{ room: Room; member: Member }> {
    if (this.rooms.size >= this.maxRooms) {
      return { ok: false, code: 'too_many_rooms', message: 'Der Server ist ausgelastet.' };
    }
    const room = new Room(this.newCode(), this.opts, {
      name: opts.roomName ?? defaultRoomName(name),
      visibility: opts.visibility ?? 'public',
      password: opts.password,
    });
    const joined = room.join(name, conn, undefined, { password: opts.password, avatar: opts.avatar });
    if (!joined.ok) return joined;
    this.rooms.set(room.code, room);
    return { ok: true, value: { room, member: joined.value } };
  }

  /** Tickt jeden Raum einzeln abgesichert; ein kaputter Raum fliegt nach wiederholten Fehlern raus. */
  tickAll(): void {
    for (const [code, room] of [...this.rooms]) {
      try {
        room.tick();
        this.failures.delete(code);
      } catch (err) {
        const n = (this.failures.get(code) ?? 0) + 1;
        this.failures.set(code, n);
        try {
          if (this.opts.onError) this.opts.onError(err, room);
          else console.error(`Tick-Fehler in Raum ${code}:`, err);
        } catch {
          /* Logging darf nie selbst scheitern */
        }
        if (n >= this.maxTickFailures) this.evict(code, room);
      }
    }
  }

  private evict(code: string, room: Room): void {
    this.rooms.delete(code);
    this.failures.delete(code);
    for (const m of room.members) {
      try {
        m.conn?.send({ t: 'error', code: 'bad_message', message: 'Der Raum wurde wegen eines Fehlers geschlossen.' });
        m.conn?.close?.(1011, 'room failed');
      } catch {
        /* Verbindung schon weg */
      }
    }
  }

  /** Löscht Räume, die lange leer waren. */
  sweep(): void {
    for (const [code, room] of this.rooms) {
      if (room.isDead()) {
        this.rooms.delete(code);
        this.failures.delete(code);
      }
    }
  }
}
