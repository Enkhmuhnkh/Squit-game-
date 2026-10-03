import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomManager } from './RoomManager.js';
import { SessionStore } from './SessionStore.js';
import { Snapshotter } from './Snapshotter.js';
import { createFileSnapshotStore } from '../persistence/fileSnapshotStore.js';

function world() {
  return { rooms: new RoomManager(), sessions: new SessionStore() };
}

test('running game survives a full server restart (file snapshot)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hub-'));
  try {
    const file = join(dir, 'snap.json');

    // ───── 1-р сервер: тоглолт эхлүүлж, хэдэн алхам хийнэ ─────
    const a = world();
    const alice = a.sessions.init({ nickname: 'Alice' });
    const bob = a.sessions.init({ nickname: 'Bob' });
    const room = a.rooms.createRoom(alice);
    a.rooms.join(room.code, bob);
    const { room: r } = a.rooms.startGame(alice);
    const e = r.engine;
    for (let i = 0; i < 4; i++) {
      const cur = e.currentPlayerId;
      e.handleAction(cur, { type: 'choose', side: e.bridge[e.players.get(cur).step] });
    }
    const before = e.getPublicState(alice.id);
    const snapA = new Snapshotter({ ...a, store: createFileSnapshotStore(file) });
    snapA.markDirty(room.code);
    await snapA.flush();

    // ───── сервер унаж, шинээр асна ─────
    const b = world();
    const snapB = new Snapshotter({ ...b, store: createFileSnapshotStore(file) });
    assert.equal(await snapB.restoreAll(), 1);

    // refresh хийсэн Alice хуучин token-оороо буцаж ирнэ
    const alice2 = b.sessions.init({ sessionToken: alice.token, nickname: 'Alice' });
    assert.equal(alice2.id, alice.id);
    const room2 = b.rooms.setConnected(alice2, true);
    assert.equal(room2.code, room.code);
    assert.equal(room2.status, 'playing');

    const after = room2.engine.getPublicState(alice.id);
    assert.deepEqual(after.players, before.players);
    assert.deepEqual(after.revealed, before.revealed);
    assert.equal(after.currentPlayerId, before.currentPlayerId);
    assert.ok(after.deadline > Date.now() - 1000, 'ээлжийн хугацаа шинээр эхэлсэн');
    assert.ok(!JSON.stringify(after).includes('"bridge"'), 'нууц map клиентэд явахгүй');

    // тоглолт үргэлжилнэ
    const cur = room2.engine.currentPlayerId;
    room2.engine.handleAction(cur, { type: 'choose', side: room2.engine.bridge[room2.engine.players.get(cur).step] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('deleted room is removed from the snapshot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hub-'));
  try {
    const file = join(dir, 'snap.json');
    const a = world();
    const p = a.sessions.init({ nickname: 'Solo' });
    const room = a.rooms.createRoom(p);
    const s = new Snapshotter({ ...a, store: createFileSnapshotStore(file) });
    s.markDirty(room.code);
    await s.flush();
    a.rooms.leave(p); // сүүлийн хүн гарвал өрөө устна
    s.markDirty(room.code);
    await s.flush();

    const b = world();
    const s2 = new Snapshotter({ ...b, store: createFileSnapshotStore(file) });
    assert.equal(await s2.restoreAll(), 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('result dialog acknowledged once is not resent', () => {
  const a = world();
  const p1 = a.sessions.init({ nickname: 'One' });
  const p2 = a.sessions.init({ nickname: 'Two' });
  const room = a.rooms.createRoom(p1);
  a.rooms.join(room.code, p2);
  a.rooms.startGame(p1);
  a.rooms.ackResult(p1);
  assert.equal(room.members.get(p1.id).ackedResult, true);
  // дахин join (reconnect) хийхэд ack хэвээр
  a.rooms.join(room.code, p1);
  assert.equal(room.members.get(p1.id).ackedResult, true);
  // шинэ тоглолт эхлэхэд дахин false
  room.status = 'lobby';
  a.rooms.startGame(p1);
  assert.equal(room.members.get(p1.id).ackedResult, false);
});
