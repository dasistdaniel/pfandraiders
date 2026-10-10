import { CITY_MAP, DEFAULT_MAP_ID, RETRO_MAP } from '@pfandraiders/core';
import type { ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room';
import type { Conn, RoomOptions } from '../src/room';

class FakeConn implements Conn {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> {
    const all = this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
    return all[all.length - 1];
  }
}

/** Anna (Host p1) und Bob (p2) in der Lobby; eine Runde ist nach zwei Ticks vorbei (roundMs 100). */
function twoInLobby(opts: RoomOptions = {}) {
  const room = new Room('ABCD', { now: () => 0, random: () => 0.5, roundMs: 100, countdownMs: 0, ...opts });
  const conns = [new FakeConn(), new FakeConn()];
  ['Anna', 'Bob'].forEach((name, i) => {
    if (!room.join(name, conns[i]).ok) throw new Error('join failed');
  });
  const endRound = () => {
    for (let i = 0; i < 100 && room.phase === 'playing'; i++) room.tick();
  };
  const allReady = () => {
    for (const m of room.members) if (m.conn) room.setReady(m, true);
  };
  return { room, conns, endRound, allReady };
}

describe('map choice in the room', () => {
  it('starts with the server default and names it in lobby and room list', () => {
    const { room, conns } = twoInLobby();
    expect(room.selectedMapId()).toBe(DEFAULT_MAP_ID);
    expect(conns[1].last('lobby')).toMatchObject({ mapId: 'city', mapName: 'Stadt' });
    expect(room.info()).toMatchObject({ mapName: 'Stadt' });
    const retro = twoInLobby({ mapId: 'retro' });
    expect(retro.conns[0].last('lobby')).toMatchObject({ mapId: 'retro', mapName: 'Retro' });
  });

  it('falls back to the default map for an unknown map option', () => {
    expect(twoInLobby({ mapId: 'moon' }).room.selectedMapId()).toBe(DEFAULT_MAP_ID);
  });

  it('lets only the host change the map, only in the lobby', () => {
    const { room, conns, endRound } = twoInLobby();
    expect(room.setMap('p2', 'retro')).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.setMap('', 'retro')).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.setMap('p1', 'moon')).toMatchObject({ ok: false, code: 'bad_message' });
    expect(room.selectedMapId()).toBe('city');
    expect(room.setMap('p1', 'retro')).toEqual({ ok: true, value: undefined });
    expect(conns[1].last('lobby')).toMatchObject({ mapId: 'retro', mapName: 'Retro' });
    expect(room.info()).toMatchObject({ mapName: 'Retro' });
    room.start('p1');
    expect(room.setMap('p1', 'city')).toMatchObject({ ok: false, code: 'wrong_phase' });
    endRound();
    expect(room.phase).toBe('shop');
    expect(room.setMap('p1', 'city')).toMatchObject({ ok: false, code: 'wrong_phase' });
    expect(room.selectedMapId()).toBe('retro');
  });

  it('keeps the chosen map for every round and after toLobby', () => {
    const { room, conns, endRound, allReady } = twoInLobby();
    room.setMap('p1', 'retro');
    room.start('p1');
    expect(conns[0].last('start')).toMatchObject({ mapId: 'retro', round: 1 });
    expect(conns[0].last('start').map).toEqual(RETRO_MAP);
    endRound();
    allReady();
    expect(conns[1].last('start')).toMatchObject({ mapId: 'retro', round: 2 });
    expect(conns[1].last('start').map.cols).toBe(RETRO_MAP.cols);
    endRound();
    expect(room.endSeries('p1').ok).toBe(true);
    expect(room.phase).toBe('final');
    expect(room.toLobby('p1').ok).toBe(true);
    expect(conns[0].last('lobby')).toMatchObject({ phase: 'lobby', mapId: 'retro', mapName: 'Retro' });
    room.start('p1');
    expect(conns[0].last('start')).toMatchObject({ mapId: 'retro', round: 1 });
  });

  it('uses the map data override only until the host picks another map', () => {
    const a = twoInLobby({ map: RETRO_MAP });
    a.room.start('p1');
    expect(a.conns[0].last('start')).toMatchObject({ mapId: 'city' });
    expect(a.conns[0].last('start').map.cols).toBe(RETRO_MAP.cols);
    const b = twoInLobby({ map: RETRO_MAP });
    b.room.setMap('p1', 'retro');
    b.room.setMap('p1', 'city');
    b.room.start('p1');
    expect(b.conns[0].last('start').map.cols).toBe(CITY_MAP.cols);
  });

  it('starts the example map uebung when the host picks it', () => {
    const { room, conns } = twoInLobby();
    expect(room.setMap('p1', 'uebung').ok).toBe(true);
    expect(conns[1].last('lobby')).toMatchObject({ mapId: 'uebung', mapName: 'Übung' });
    room.start('p1');
    expect(conns[1].last('start')).toMatchObject({ mapId: 'uebung' });
    expect(conns[1].last('start').map.cols).toBe(40);
  });
});
