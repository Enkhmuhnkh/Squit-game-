import { useState } from 'react';
import { useGameStore } from '../store/useGameStore.js';
import { loadSession } from '../lib/session.js';

export default function Home() {
  const login = useGameStore((s) => s.login);
  const connected = useGameStore((s) => s.connected);
  const [nickname, setNickname] = useState(loadSession()?.nickname ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(nickname);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center gap-6 px-4">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Party Game Hub</h1>
        <p className="mt-1 text-slate-400">Бүртгэлгүй. Хоч нэрээ бичээд л тоглоорой.</p>
      </header>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={16}
          autoFocus
          placeholder="Хоч нэр (2–16 тэмдэгт)"
          className="rounded-lg bg-slate-800 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-emerald-400"
        />
        <button
          disabled={busy || !connected || nickname.trim().length < 2}
          className="rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-black disabled:opacity-40"
        >
          Орох
        </button>
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </form>
    </main>
  );
}
