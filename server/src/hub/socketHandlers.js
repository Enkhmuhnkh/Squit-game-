import { GameError } from '../games/GameError.js';
import { RoomManager } from './RoomManager.js';
import { SessionStore } from './SessionStore.js';
import { Snapshotter } from './Snapshotter.js';
import { saveFinishedGame } from '../persistence/gameRepository.js';

const RATE_LIMIT_PER_SEC = 12;

export function attachHub(io, { store }) {
  const sessions = new SessionStore();
  const rooms = new RoomManager();
  const snap = new Snapshotter({ rooms, sessions, store });

  // ───────── эмит туслахууд ─────────

  function emitEvents(room, events) {
    for (const ev of events) {
      if (ev.to === 'room') {
        io.to(room.code).emit(ev.type, ev.payload);
      } else {
        const target = sessions.get(ev.to);
        if (target?.socketId) io.to(target.socketId).emit(ev.type, ev.payload);
      }
    }
  }

  function broadcastRoom(room) {
    io.to(room.code).emit('room:state', rooms.publicState(room));
  }

  /**
   * Тоглогчид өөрийнх нь харж болох тоглоомын төлөвийг илгээнэ (нууц map орохгүй).
   * Зөвхөн тухайн тоглолтод оролцсон хүнд; дууссан тоглолтын үр дүнг хаасан хүнд дахин үзүүлэхгүй.
   */
  function sendGameState(room, playerId) {
    if (!room.engine || !room.engine.players.has(playerId)) return;
    if (room.engine.isFinished() && room.members.get(playerId)?.ackedResult) return;
    const p = sessions.get(playerId);
    if (p?.socketId) io.to(p.socketId).emit('game:state', room.engine.getPublicState(playerId));
  }

  async function afterEngine(room, events) {
    emitEvents(room, events);
    snap.markDirty(room.code);
    if (room.engine?.isFinished() && !room.persisted) {
      room.persisted = true;
      rooms.markFinished(room);
      broadcastRoom(room);
      try {
        const players = [...room.engine.players.values()].map((p) => ({
          ...sessions.get(p.id), id: p.id, nickname: p.nickname,
        }));
        await saveFinishedGame({
          room, players, result: room.engine.getResult(), startedAt: room.sessionStartedAt,
        });
      } catch (err) {
        console.error('[db] тоглолт хадгалахад алдаа:', err);
      }
    }
  }

  // ───────── socket холболт ─────────

  io.on('connection', (socket) => {
    let bucket = { t: Date.now(), n: 0 };

    /** Бүх event-ийг rate limit, алдаа барилт, ack-аар бүрхэнэ. */
    const on = (event, handler, { needSession = true } = {}) => {
      socket.on(event, async (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        const now = Date.now();
        if (now - bucket.t > 1000) bucket = { t: now, n: 0 };
        if (++bucket.n > RATE_LIMIT_PER_SEC) {
          return reply({ ok: false, code: 'RATE_LIMITED', message: 'Хэт олон хүсэлт' });
        }
        // playerId-г ЗӨВХӨН socket.data-аас авна, клиентийн payload-д итгэхгүй
        const player = socket.data.playerId ? sessions.get(socket.data.playerId) : null;
        const roomBefore = player?.roomCode ?? null;
        try {
          if (needSession && !player) throw new GameError('NO_SESSION', 'Эхлээд session:init хийнэ үү');
          const result = (await handler(player, payload ?? {})) ?? {};
          reply({ ok: true, ...result });
        } catch (err) {
          if (err instanceof GameError) {
            reply({ ok: false, code: err.code, message: err.message });
          } else {
            console.error(`[socket] ${event} алдаа:`, err);
            reply({ ok: false, code: 'INTERNAL', message: 'Серверийн алдаа' });
          }
        } finally {
          // Өрөөнд өөрчлөлт орсон байж болзошгүй: өмнөх болон одоогийн өрөөг хадгална
          snap.markDirty(roomBefore);
          snap.markDirty(player?.roomCode);
        }
      });
    };

    on('session:init', (_, { sessionToken, nickname }) => {
      const player = sessions.init({ sessionToken, nickname });
      player.socketId = socket.id;
      socket.data.playerId = player.id;

      // Refresh / reconnect / server restart-ийн дараа өөрийн өрөө, тоглолтдоо буцна
      const room = rooms.setConnected(player, true);
      if (room) {
        socket.join(room.code);
        broadcastRoom(room);
        sendGameState(room, player.id);
      } else {
        player.roomCode = null;
      }
      return {
        playerId: player.id,
        sessionToken: player.token,
        nickname: player.nickname,
        room: room ? rooms.publicState(room) : null,
      };
    }, { needSession: false });

    on('room:create', (player, { gameId }) => {
      const room = rooms.createRoom(player, gameId);
      socket.join(room.code);
      broadcastRoom(room);
      return { room: rooms.publicState(room) };
    });

    on('room:join', (player, { code }) => {
      const room = rooms.join(code, player);
      socket.join(room.code);
      broadcastRoom(room);
      sendGameState(room, player.id);
      return { room: rooms.publicState(room) };
    });

    on('room:leave', (player) => {
      const code = player.roomCode;
      socket.leave(code);
      const room = rooms.leave(player);
      if (room) broadcastRoom(room);
      return {};
    });

    on('room:selectGame', (player, { gameId }) => {
      const room = rooms.selectGame(player, gameId);
      broadcastRoom(room);
      return {};
    });

    on('game:start', async (player) => {
      const { room, events } = rooms.startGame(player);
      broadcastRoom(room);
      emitEvents(room, events);
      for (const id of room.engine.players.keys()) sendGameState(room, id);
      return {};
    });

    on('game:ackResult', (player) => {
      rooms.ackResult(player);
      return {};
    });

    // ───── Шилэн гүүр ─────

    const gbAction = (player, action) => {
      const room = rooms.getRoom(player.roomCode);
      if (!room?.engine || room.status !== 'playing') {
        throw new GameError('NOT_RUNNING', 'Тоглоом явагдаагүй байна');
      }
      const { events } = room.engine.handleAction(player.id, action);
      return afterEngine(room, events);
    };

    on('gb:choose', (player, { side }) => gbAction(player, { type: 'choose', side }));
    on('gb:buy', (player, { item }) => gbAction(player, { type: 'buy', item }));
    on('gb:useItem', (player, { item, targetId }) => gbAction(player, { type: 'use', item, targetId }));

    socket.on('disconnect', () => {
      const player = socket.data.playerId ? sessions.get(socket.data.playerId) : null;
      if (!player || player.socketId !== socket.id) return; // шинэ socket-ээр аль хэдийн сэргэсэн
      player.socketId = null;
      const room = rooms.setConnected(player, false);
      if (room) broadcastRoom(room);
    });
  });

  // ───────── timer loop ─────────
  const tickTimer = setInterval(() => {
    for (const { room, events } of rooms.tickAll()) afterEngine(room, events);
  }, 500);
  const sweepTimer = setInterval(() => {
    for (const code of rooms.sweep()) snap.markDirty(code); // устсан өрөөний snapshot-ыг устгана
  }, 60_000);
  tickTimer.unref();
  sweepTimer.unref();
  snap.start();

  return {
    sessions,
    rooms,
    restore: () => snap.restoreAll(),
    shutdown: () => snap.stop(),
  };
}
