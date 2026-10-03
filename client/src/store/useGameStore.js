import { create } from 'zustand';
import { socket, emit } from '../lib/socket.js';
import { loadSession, saveSession, clearSession } from '../lib/session.js';

let bound = false;
let noticeTimer = null;
let cheatTimer = null;
let stepCounter = 0;
let reactionCounter = 0;

export const useGameStore = create((set, get) => {
  /** game төлөвийг аюулгүй шинэчлэх */
  const patchGame = (fn) => set((s) => (s.game ? { game: fn(s.game) } : {}));

  const notify = (msg) => {
    set({ notice: msg });
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => set({ notice: null }), 3500);
  };

  function bindSocket() {
    if (bound) return;
    bound = true;

    socket.on('connect', () => {
      set({ connected: true });
      // Reconnect / refresh: хадгалсан token-оор өмнөх тоглогчоо сэргээнэ
      const saved = loadSession();
      if (saved) get().login(saved.nickname).catch(() => set({ restoring: false }));
      else set({ restoring: false });
    });
    socket.on('disconnect', () => set({ connected: false }));

    socket.on('room:state', (room) => set({ room, quickMatch: null }));

    socket.on('quickmatch:waiting', (status) => set({ quickMatch: status }));

    socket.on('room:reaction', ({ playerId, emoji }) => {
      const id = ++reactionCounter;
      set((s) => ({ reactions: [...s.reactions, { id, playerId, emoji }] }));
      setTimeout(() => set((s) => ({ reactions: s.reactions.filter((r) => r.id !== id) })), 2200);
    });

    socket.on('room:kicked', () => {
      set({ room: null, game: null, result: null, showGame: false });
      notify('Таныг өрөөнөөс хаслаа');
    });

    socket.on('game:started', () => set({ result: null, showGame: true, cheat: null, lastStep: null }));

    // Refresh / reconnect / server restart-ийн дараа сервер тоглолтын төлөвийг дахин илгээнэ
    socket.on('game:state', (game) => {
      set({
        game,
        skew: game.serverTime - Date.now(),
        // Дууссан ч үр дүнг нь хараагүй бол дахин үзүүлнэ
        result: game.status === 'finished' ? game.result : get().result,
        showGame: game.status === 'running' || game.status === 'finished' ? true : get().showGame,
      });
    });

    socket.on('gb:turn', ({ playerId, deadline, serverTime }) => {
      set({ skew: serverTime - Date.now() });
      patchGame((g) => ({ ...g, currentPlayerId: playerId, deadline }));
    });

    socket.on('gb:stepResult', (r) => {
      patchGame((g) => {
        const revealed = [...g.revealed];
        revealed[r.step - 1] = r.safeSide; // шат туршигдмагц нийтэд ил болно
        return {
          ...g,
          revealed,
          players: g.players.map((p) =>
            p.id === r.playerId
              ? { ...p, step: r.newStep, alive: !r.eliminated, finished: r.finished }
              : p),
        };
      });
      set({ lastStep: { ...r, id: ++stepCounter } });
    });

    socket.on('gb:balances', ({ balances, deathPool }) => {
      patchGame((g) => ({
        ...g,
        deathPool,
        players: g.players.map((p) => ({ ...p, balance: balances[p.id] ?? p.balance })),
      }));
    });

    socket.on('gb:inventory', ({ items }) => {
      patchGame((g) => ({ ...g, me: { ...(g.me ?? {}), items } }));
    });

    socket.on('gb:cheatReveal', ({ step, safeSide, ms }) => {
      set({ cheat: { step, safeSide } });
      clearTimeout(cheatTimer);
      cheatTimer = setTimeout(() => set({ cheat: null }), ms); // 3 секундийн дараа алга болно
    });

    socket.on('gb:swapped', ({ turnOrder }) => patchGame((g) => ({ ...g, turnOrder })));

    socket.on('gb:pushed', ({ by, target }) => {
      const name = (id) => get().game?.players.find((p) => p.id === id)?.nickname ?? '?';
      notify(`${name(by)} → ${name(target)}-г түлхлээ!`);
    });

    socket.on('gb:finished', (result) => {
      patchGame((g) => ({ ...g, status: 'finished' }));
      set({ result, cheat: null });
    });

    // ───── Улаан гэрэл, Ногоон гэрэл ─────

    socket.on('rl:light', ({ light, deadline, serverTime }) => {
      set({ skew: serverTime - Date.now() });
      patchGame((g) => ({ ...g, light, deadline }));
    });

    socket.on('rl:progress', ({ playerId, progress, finished }) => {
      patchGame((g) => ({
        ...g,
        players: g.players.map((p) => (p.id === playerId ? { ...p, progress, finished } : p)),
      }));
    });

    socket.on('rl:eliminated', ({ playerId }) => {
      patchGame((g) => ({
        ...g,
        players: g.players.map((p) => (p.id === playerId ? { ...p, alive: false } : p)),
      }));
      set({ lastStep: { eliminated: true, playerId, id: ++stepCounter } });
    });

    socket.on('rl:balances', ({ balances, deathPool }) => {
      patchGame((g) => ({
        ...g,
        deathPool,
        players: g.players.map((p) => ({ ...p, balance: balances[p.id] ?? p.balance })),
      }));
    });

    socket.on('rl:finished', (result) => {
      patchGame((g) => ({ ...g, status: 'finished' }));
      set({ result, cheat: null });
    });
  }

  return {
    // ───── төлөв ─────
    connected: false,
    restoring: !!loadSession(), // хадгалсан session-оор автоматаар сэргээж байна уу
    session: null, // { playerId, nickname }
    room: null,
    game: null,
    skew: 0, // serverTime - clientTime
    cheat: null, // { step, safeSide } — зөвхөн надад
    lastStep: null, // дуу/анимацийн триггер
    result: null,
    showGame: false,
    notice: null,
    notify,
    uiView: 'lobby', // 'lobby' | 'stats'
    setUiView: (uiView) => set({ uiView }),
    quickMatch: null, // { gameId, size, minPlayers } | null
    reactions: [], // [{ id, playerId, emoji }] — богино хугацаанд float хийгээд арилна

    // ───── үйлдлүүд ─────
    boot() {
      bindSocket();
      if (!socket.connected) socket.connect();
    },

    async login(nickname) {
      const saved = loadSession();
      const res = await emit('session:init', { sessionToken: saved?.sessionToken, nickname });
      saveSession({ sessionToken: res.sessionToken, nickname: res.nickname });
      set({ session: { playerId: res.playerId, nickname: res.nickname }, room: res.room, restoring: false });
    },

    logout() {
      clearSession();
      socket.disconnect();
      set({ session: null, room: null, game: null, result: null, showGame: false });
      socket.connect();
    },

    async createRoom(gameId = 'glass-bridge') {
      const { room } = await emit('room:create', { gameId });
      set({ room });
    },

    async joinRoom(code) {
      const { room } = await emit('room:join', { code: code.trim().toUpperCase() });
      set({ room });
    },

    async leaveRoom() {
      await emit('room:leave');
      set({ room: null, game: null, result: null, showGame: false });
    },

    selectGame: (gameId) => emit('room:selectGame', { gameId }),
    startGame: () => emit('game:start'),
    kickPlayer: (targetId) => emit('room:kick', { targetId }),

    async quickMatchJoin(gameId) {
      const { status } = await emit('quickmatch:join', { gameId });
      set({ quickMatch: status });
    },
    async quickMatchLeave() {
      await emit('quickmatch:leave').catch(() => {});
      set({ quickMatch: null });
    },

    react: (emoji) => emit('room:react', { emoji }).catch(() => {}),

    // ───── Шилэн гүүр ─────
    choose: (side) => emit('gb:choose', { side }),
    buy: (item) => emit('gb:buy', { item }),
    useItem: (item, targetId) => emit('gb:useItem', { item, targetId }),

    // ───── Улаан гэрэл, Ногоон гэрэл ─────
    move: () => emit('rl:move'),

    dismissGame() {
      emit('game:ackResult').catch(() => {}); // refresh хийвэл үр дүнг дахин үзүүлэхгүй
      set({ showGame: false, game: null, result: null, lastStep: null, cheat: null });
    },
  };
});
