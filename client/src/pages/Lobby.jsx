import { useState } from 'react';
import { useGameStore } from '../store/useGameStore.js';

export default function Lobby() {
  const session = useGameStore((s) => s.session);
  const createRoom = useGameStore((s) => s.createRoom);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const logout = useGameStore((s) => s.logout);
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
      <button onClick={logout} className="text-sm text-slate-500 underline">Нэр солих</button>
    </main>
  );
}
