import { useState } from 'react';
import { useGameStore } from '../store/useGameStore.js';
import { gameScreens } from '../games/index.js';
import ReactionBar from '../components/ReactionBar.jsx';

export default function Room() {
  const session = useGameStore((s) => s.session);
  const room = useGameStore((s) => s.room);
  const game = useGameStore((s) => s.game);
  const showGame = useGameStore((s) => s.showGame);
  const { leaveRoom, selectGame, startGame, kickPlayer } = useGameStore.getState();
  const [error, setError] = useState('');

  const isHost = room.hostId === session.playerId;
  const Screen = gameScreens[room.gameId];

  // Тоглоом явагдаж байгаа (эсвэл үр дүнгийн дэлгэц нээлттэй) үед тоглоомын дэлгэц
  if (showGame && game && Screen) return <Screen />;

  const run = (fn) => async () => {
    setError('');
    try { await fn(); } catch (e) { setError(e.message); }
  };

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col gap-6 px-4 py-10">
      <header className="text-center">
        <p className="text-sm text-slate-400">Өрөөний код</p>
        <button
          onClick={() => navigator.clipboard?.writeText(room.code)}
          title="Хуулах"
          className="font-mono text-5xl font-bold tracking-[0.3em]"
        >
          {room.code}
        </button>
        <p className="mt-1 text-xs text-slate-500">Найзууддаа энэ кодыг илгээ</p>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-400">Тоглогчид ({room.players.length})</h2>
        <ul className="flex flex-col gap-2">
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-lg bg-slate-800 px-4 py-2">
              <span>
                {p.nickname}
                {p.id === session.playerId && <span className="ml-2 text-xs text-slate-500">(та)</span>}
              </span>
              <span className="flex items-center gap-2 text-xs text-slate-400">
                {p.id === room.hostId && <span className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-300">HOST</span>}
                <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                {isHost && room.status === 'lobby' && p.id !== session.playerId && (
                  <button
                    onClick={run(() => kickPlayer(p.id))}
                    title="Хасах"
                    className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300 hover:bg-rose-500/40"
                  >
                    ✕
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-400">Тоглоом</h2>
        <div className="flex flex-wrap gap-2">
          {room.games.map((g) => (
            <button
              key={g.id}
              disabled={!isHost}
              onClick={run(() => selectGame(g.id))}
              className={`rounded-lg px-4 py-2 text-sm ring-1 ${
                room.gameId === g.id ? 'bg-emerald-500/20 ring-emerald-400' : 'bg-slate-800 ring-white/10'
              } disabled:cursor-default`}
            >
              {g.name}
              <span className="ml-2 text-xs text-slate-400">{g.minPlayers}–{g.maxPlayers}</span>
            </button>
          ))}
        </div>
      </section>

      {error && <p className="text-center text-sm text-rose-400">{error}</p>}

      <ReactionBar />

      <div className="mt-auto flex gap-3">
        <button onClick={run(leaveRoom)} className="rounded-lg bg-slate-800 px-4 py-3">Гарах</button>
        {isHost ? (
          <button onClick={run(startGame)} className="flex-1 rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-black">
            Тоглоом эхлүүлэх
          </button>
        ) : (
          <p className="flex flex-1 items-center justify-center text-sm text-slate-400">Host эхлүүлэхийг хүлээж байна…</p>
        )}
      </div>
    </main>
  );
}
