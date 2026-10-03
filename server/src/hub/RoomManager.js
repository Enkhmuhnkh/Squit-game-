import { randomInt } from 'node:crypto';
import { GameError } from '../games/GameError.js';
import { getEngineClass, listGames } from '../games/registry.js';

// O/0/I/1 гэх мэт төөрөгдүүлэх тэмдэгтгүй
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ABANDONED_AFTER_MS = 5 * 60_000;

function makeCode() {
  return Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]).join('');
}

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> room
  }

  getRoom(code) {
    return this.rooms.get(String(code ?? '').toUpperCase()) ?? null;
  }

  createRoom(host, gameId = 'glass-bridge') {
    if (host.roomCode) this.leave(host);
    if (!getEngineClass(gameId)) throw new GameError('UNKNOWN_GAME', 'Ийм тоглоом байхгүй');
    let code;
    do code = makeCode(); while (this.rooms.has(code));
    const room = {
      code,
      hostId: host.id,
      gameId,
      status: 'lobby', // lobby | playing
      members: new Map(), // playerId -> { id, nickname, connected, lastSeen }
      engine: null,
      sessionStartedAt: null,
      persisted: false,
    };
    this.rooms.set(code, room);
    this.#addMember(room, host);
    return room;
  }

  join(code, player) {
    const room = this.getRoom(code);
    if (!room) throw new GameError('ROOM_NOT_FOUND', 'Өрөө олдсонгүй');
    const already = room.members.has(player.id);
    if (!already) {
      if (room.status === 'playing') throw new GameError('GAME_IN_PROGRESS', 'Тоглоом эхэлчихсэн байна');
      const max = getEngineClass(room.gameId).meta.maxPlayers;
      if (room.members.size >= max) throw new GameError('ROOM_FULL', 'Өрөө дүүрсэн байна');
      if (player.roomCode) this.leave(player);
    }
    this.#addMember(room, player);
    return room;
  }

  /** Тоглогч өөрөө гарах. Тоглоом явагдаж байвал engine тэднийг auto-play-ээр үргэлжлүүлнэ. */
  leave(player) {
    const room = this.getRoom(player.roomCode);
    player.roomCode = null;
    if (!room) return null;
    room.members.delete(player.id);
    if (room.members.size === 0) {
      this.rooms.delete(room.code);
      return null;
    }
    if (room.hostId === player.id) room.hostId = room.members.keys().next().value;
    return room;
  }

  setConnected(player, connected) {
    const room = this.getRoom(player.roomCode);
    const m = room?.members.get(player.id);
    if (m) {
      m.connected = connected;
      m.lastSeen = Date.now();
    }
    return room;
  }

  selectGame(player, gameId) {
    const room = this.#requireHostLobby(player);
    if (!getEngineClass(gameId)) throw new GameError('UNKNOWN_GAME', 'Ийм тоглоом байхгүй');
    room.gameId = gameId;
    return room;
  }

  startGame(player) {
    const room = this.#requireHostLobby(player);
    const Engine = getEngineClass(room.gameId);
    const connected = [...room.members.values()].filter((m) => m.connected);
    if (connected.length < Engine.meta.minPlayers) {
      throw new GameError('NOT_ENOUGH_PLAYERS', `Хамгийн багадаа ${Engine.meta.minPlayers} тоглогч хэрэгтэй`);
    }
    room.engine = new Engine({ players: connected.map((m) => ({ id: m.id, nickname: m.nickname })) });
    room.status = 'playing';
    room.persisted = false;
    room.sessionStartedAt = new Date();
    for (const m of room.members.values()) m.ackedResult = false; // шинэ тоглолт: үр дүнг дахин үзүүлнэ
    const { events } = room.engine.start();
    return { room, events };
  }

  /** Тоглогч үр дүнгийн дэлгэцийг хаасан: refresh хийвэл дахин үзүүлэхгүй. */
  ackResult(player) {
    const room = this.getRoom(player.roomCode);
    const m = room?.members.get(player.id);
    if (m) m.ackedResult = true;
    return room;
  }

  // ───── хадгалалт (snapshot) ─────

  serializeRoom(room) {
    return {
      code: room.code,
      hostId: room.hostId,
      gameId: room.gameId,
      status: room.status,
      persisted: room.persisted,
      sessionStartedAt: room.sessionStartedAt ? room.sessionStartedAt.toISOString() : null,
      members: [...room.members.values()].map((m) => ({
        id: m.id,
        nickname: m.nickname,
        ackedResult: !!m.ackedResult,
      })),
      engine: room.engine ? room.engine.serialize() : null,
    };
  }

  /** Server restart-ийн дараа өрөөг сэргээнэ. Бүх гишүүн "холбогдоогүй" төлөвтэй, reconnect хийхийг хүлээнэ. */
  restoreRoom(snap) {
    const Engine = getEngineClass(snap.gameId);
    if (!Engine) throw new GameError('UNKNOWN_GAME', `Тоглоом олдсонгүй: ${snap.gameId}`);
    const room = {
      code: snap.code,
      hostId: snap.hostId,
      gameId: snap.gameId,
      status: snap.status,
      members: new Map(snap.members.map((m) => [m.id, {
        id: m.id,
        nickname: m.nickname,
        connected: false,
        lastSeen: Date.now(), // сэргээснээс хойш 5 минут reconnect хийх хугацаа өгнө
        ackedResult: !!m.ackedResult,
      }])),
      engine: snap.engine ? Engine.restore(snap.engine) : null,
      sessionStartedAt: snap.sessionStartedAt ? new Date(snap.sessionStartedAt) : null,
      persisted: !!snap.persisted,
    };
    if (room.engine?.status === 'running') room.engine.resume(); // серверийн унасан хугацаанд хэнийг ч унагахгүй
    this.rooms.set(room.code, room);
    return room;
  }

  /** Тоглоом дууссаны дараа өрөө lobby руу буцна. */
  markFinished(room) {
    room.status = 'lobby';
  }

  publicState(room) {
    return {
      code: room.code,
      hostId: room.hostId,
      gameId: room.gameId,
      status: room.status,
      games: listGames(),
      players: [...room.members.values()].map((m) => ({
        id: m.id,
        nickname: m.nickname,
        connected: m.connected,
      })),
    };
  }

  /** Бүх идэвхтэй engine-ийн timer шалгах. */
  tickAll() {
    const out = [];
    for (const room of this.rooms.values()) {
      if (room.status === 'playing' && room.engine) {
        const { events } = room.engine.tick();
        if (events.length) out.push({ room, events });
      }
    }
    return out;
  }

  /** Хэн ч холбогдоогүй удсан өрөөг цэвэрлэнэ. Устсан өрөөний кодуудыг буцаана. */
  sweep() {
    const now = Date.now();
    const removed = [];
    for (const [code, room] of this.rooms) {
      const anyone = [...room.members.values()].some((m) => m.connected || now - m.lastSeen < ABANDONED_AFTER_MS);
      if (!anyone) {
        this.rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }

  // ───── private ─────

  #addMember(room, player) {
    room.members.set(player.id, {
      id: player.id,
      nickname: player.nickname,
      connected: true,
      lastSeen: Date.now(),
      ackedResult: room.members.get(player.id)?.ackedResult ?? false,
    });
    player.roomCode = room.code;
  }

  #requireHostLobby(player) {
    const room = this.getRoom(player.roomCode);
    if (!room) throw new GameError('NOT_IN_ROOM', 'Та өрөөнд байхгүй байна');
    if (room.hostId !== player.id) throw new GameError('NOT_HOST', 'Зөвхөн host хийж чадна');
    if (room.status !== 'lobby') throw new GameError('GAME_IN_PROGRESS', 'Тоглоом явагдаж байна');
    return room;
  }
}
