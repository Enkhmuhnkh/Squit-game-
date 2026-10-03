import { GameError } from '../games/GameError.js';
import { getEngineClass } from '../games/registry.js';

const GRACE_MS = 8_000; // minPlayers хүрмэгц өөр хүн нэгдэх боломж олгох хугацаа

/**
 * Код мэдэхгүй, ганцаараа орж ирсэн тоглогчдыг автоматаар тоглоомд холбоно.
 * `gameId -> Set<playerId>` дараалал хөтөлнө. RoomManager/socket-той ямар ч
 * шууд холбоогүй — тохиролцоо бүрдмэгц `onMatched(ids)` callback дуудна.
 */
export class Matchmaker {
  constructor({ sessions, onMatched }) {
    this.sessions = sessions;
    this.onMatched = onMatched;
    this.queues = new Map(); // gameId -> Set<playerId>
    this.timers = new Map(); // gameId -> Timeout
  }

  join(player, gameId) {
    const Engine = getEngineClass(gameId);
    if (!Engine) throw new GameError('UNKNOWN_GAME', 'Ийм тоглоом байхгүй');
    if (player.roomCode) throw new GameError('IN_ROOM', 'Та аль хэдийн өрөөнд байна');
    this.leave(player);
    let q = this.queues.get(gameId);
    if (!q) { q = new Set(); this.queues.set(gameId, q); }
    q.add(player.id);
    player.quickMatchGameId = gameId;
    this.#maybeSchedule(gameId);
    return this.status(gameId);
  }

  leave(player) {
    const gameId = player.quickMatchGameId;
    if (!gameId) return;
    this.queues.get(gameId)?.delete(player.id);
    player.quickMatchGameId = null;
  }

  status(gameId) {
    const Engine = getEngineClass(gameId);
    const size = this.queues.get(gameId)?.size ?? 0;
    return { gameId, size, minPlayers: Engine.meta.minPlayers };
  }

  /** Тухайн gameId-ийн дараалалд байгаа бүх playerId (UI-д байдал мэдэгдэхэд). */
  queuedPlayerIds(gameId) {
    return [...(this.queues.get(gameId) ?? [])];
  }

  #maybeSchedule(gameId) {
    const Engine = getEngineClass(gameId);
    const q = this.queues.get(gameId);
    if (q.size < Engine.meta.minPlayers || this.timers.has(gameId)) return;
    const t = setTimeout(() => this.#match(gameId), GRACE_MS);
    t.unref?.();
    this.timers.set(gameId, t);
  }

  #match(gameId) {
    this.timers.delete(gameId);
    const Engine = getEngineClass(gameId);
    const q = this.queues.get(gameId);
    if (!q || q.size < Engine.meta.minPlayers) return;

    const ids = [...q].slice(0, Engine.meta.maxPlayers);
    const players = [];
    for (const id of ids) {
      q.delete(id);
      const p = this.sessions.get(id);
      if (p) { p.quickMatchGameId = null; players.push(p); }
    }
    if (players.length < Engine.meta.minPlayers) return; // хэн нэг нь disconnect хийсэн — цуцлав

    this.onMatched(gameId, players);
  }
}
