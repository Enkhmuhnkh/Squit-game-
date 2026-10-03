/**
 * Өрөө бүрийн төлөвийг (engine-ийн нууц map-тай нь) хадгалалтад үе үе бичиж,
 * server restart-ийн дараа сэргээнэ. Ингэснээр refresh, deploy, crash-д тоглолт алга болохгүй.
 *
 * Аюулгүй байдал: snapshot-д нууц bridge, sessionToken орсон тул зөвхөн серверийн
 * хадгалалтад (DB/файл) байх ёстой, клиент рүү хэзээ ч явуулахгүй.
 */
export class Snapshotter {
  constructor({ rooms, sessions, store, intervalMs = 1000 }) {
    this.rooms = rooms;
    this.sessions = sessions;
    this.store = store;
    this.intervalMs = intervalMs;
    this.dirty = new Set();
    this.flushing = false;
    this.timer = null;
  }

  markDirty(code) {
    if (code) this.dirty.add(code);
  }

  snapshot(room) {
    return {
      v: 1,
      savedAt: Date.now(),
      room: this.rooms.serializeRoom(room),
      members: [...room.members.keys()]
        .map((id) => this.sessions.get(id))
        .filter(Boolean)
        .map((p) => ({ id: p.id, token: p.token, nickname: p.nickname })),
    };
  }

  async flush() {
    if (this.flushing || this.dirty.size === 0) return;
    this.flushing = true;
    const codes = [...this.dirty];
    this.dirty.clear();
    const upserts = new Map();
    const deletes = [];
    for (const code of codes) {
      const room = this.rooms.getRoom(code);
      if (room) upserts.set(code, this.snapshot(room));
      else deletes.push(code); // өрөө устсан
    }
    try {
      await this.store.apply({ upserts, deletes });
    } catch (err) {
      console.error('[snapshot] хадгалахад алдаа, дахин оролдоно:', err.message);
      codes.forEach((c) => this.dirty.add(c));
    } finally {
      this.flushing = false;
    }
  }

  async restoreAll() {
    const snaps = await this.store.load();
    let restored = 0;
    for (const snap of snaps) {
      try {
        this.sessions.restore(snap.members.map((m) => ({ ...m, roomCode: snap.room.code })));
        this.rooms.restoreRoom(snap.room);
        restored++;
      } catch (err) {
        console.warn('[snapshot] өрөө сэргээж чадсангүй:', err.message);
      }
    }
    return restored;
  }

  start() {
    this.timer = setInterval(() => this.flush(), this.intervalMs);
    this.timer.unref();
  }

  async stop() {
    clearInterval(this.timer);
    await this.flush();
  }
}
