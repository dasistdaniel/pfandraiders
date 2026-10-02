import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import { SERVER_CONFIG } from './config';
import { Room } from './room';
import type { Conn, Member, Result, RoomOptions } from './room';

export interface ManagerOptions extends RoomOptions {
  maxRooms?: number;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private readonly maxRooms: number;
  private readonly random: () => number;

  constructor(private readonly opts: ManagerOptions = {}) {
    this.maxRooms = opts.maxRooms ?? SERVER_CONFIG.maxRooms;
    this.random = opts.random ?? Math.random;
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

  /** Neuer Raum, der Ersteller tritt als Host bei. */
  create(name: string, conn: Conn): Result<{ room: Room; member: Member }> {
    if (this.rooms.size >= this.maxRooms) {
      return { ok: false, code: 'too_many_rooms', message: 'Der Server ist ausgelastet.' };
    }
    const room = new Room(this.newCode(), this.opts);
    const joined = room.join(name, conn);
    if (!joined.ok) return joined;
    this.rooms.set(room.code, room);
    return { ok: true, value: { room, member: joined.value } };
  }

  tickAll(): void {
    for (const room of this.rooms.values()) room.tick();
  }

  /** Löscht Räume, die lange leer waren. */
  sweep(): void {
    for (const [code, room] of this.rooms) {
      if (room.isDead()) this.rooms.delete(code);
    }
  }
}
