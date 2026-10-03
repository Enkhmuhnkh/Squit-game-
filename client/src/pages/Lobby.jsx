import { useState } from 'react';
import { useGameStore } from '../store/useGameStore.js';

const QUICK_MATCH_GAMES = [
  { id: 'glass-bridge', name: '🌉 Шилэн гүүр' },
  { id: 'red-light-green-light', name: '🟢🔴 Улаан/Ногоон гэрэл' },
];

export default function Lobby() {
  const session = useGameStore((s) => s.session);
  const createRoom = useGameStore((s) => s.createRoom);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const logout = useGameStore((s) => s.logout);
  const setUiView = useGameStore((s) => s.setUiView);
  const quickMatch = useGameStore((s) => s.quickMatch);
  const { quickMatchJoin, quickMatchLeave } = useGameStore.getState();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const run = (fn) => async () => {
    setError('');
    try { await fn(); } catch (e) { setError(e.message); }
  };

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center gap-6 px-4">
      <header className="text-center">
        <p className="text-slate-400">Сайн уу,</p>
        <h1 className="text-2xl font-bold">{session.nickname}</h1>
      </header>

      <button
        onClick={run(() => createRoom('glass-bridge'))}
        className="rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-black"
      >
        Өрөө үүсгэх
      </button>

      <div className="flex items-center gap-3 text-slate-500">
        <div className="h-px flex-1 bg-slate-700" /> эсвэл <div className="h-px flex-1 bg-slate-700" />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); run(() => joinRoom(code))(); }}
        className="flex gap-2"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={5}
          placeholder="КОД"
          className="min-w-0 flex-1 rounded-lg bg-slate-800 px-4 py-3 text-center font-mono text-lg tracking-widest outline-none ring-1 ring-white/10 focus:ring-emerald-400"
        />
        <button disabled={code.length < 5} className="rounded-lg bg-slate-700 px-5 font-semibold disabled:opacity-40">
          Орох
        </button>
      </form>

      {error && <p className="text-center text-sm text-rose-400">{error}</p>}

      <section className="flex flex-col gap-2 rounded-lg bg-slate-800/60 p-3 ring-1 ring-white/5">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-500">Хурдан тоглох</p>
        {quickMatch ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-300">
              Хайж байна… ({quickMatch.size}/{quickMatch.minPlayers})
            </span>
            <button onClick={run(quickMatchLeave)} className="rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold">
              Болих
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {QUICK_MATCH_GAMES.map((g) => (
              <button
                key={g.id}
                onClick={run(() => quickMatchJoin(g.id))}
                className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-600"
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <button onClick={() => setUiView('stats')} className="text-sm text-slate-400 underline">
        📊 Тоглогчдын самбар
      </button>
      <button onClick={logout} className="text-sm text-slate-500 underline">Нэр солих</button>
    </main>
  );
}
