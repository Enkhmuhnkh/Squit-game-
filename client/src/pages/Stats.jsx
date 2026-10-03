import { useEffect, useState } from 'react';
import { SERVER_URL } from '../lib/socket.js';
import { useGameStore } from '../store/useGameStore.js';

const fmt = (n) => `$${(n ?? 0).toLocaleString('en-US')}`;

function useFetch(path) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    fetch(`${SERVER_URL}${path}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setState({ loading: false, data, error: null }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, data: null, error: err.message }); });
    return () => { cancelled = true; };
  }, [path]);
  return state;
}

export default function Stats() {
  const session = useGameStore((s) => s.session);
  const setUiView = useGameStore((s) => s.setUiView);

  const leaderboard = useFetch('/api/stats/leaderboard?limit=20');
  const me = useFetch(`/api/stats/player/${session.playerId}`);

  const unavailable = leaderboard.data && leaderboard.data.available === false;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">📊 Тоглогчдын самбар</h1>
        <button onClick={() => setUiView('lobby')} className="text-sm text-slate-400 underline">
          ← Буцах
        </button>
      </header>

      {unavailable && (
        <p className="rounded-lg bg-slate-800 px-4 py-3 text-sm text-slate-400">
          Статистик идэвхгүй байна — серверт өгөгдлийн сан (<code>DATABASE_URL</code>) тохируулаагүй байна.
        </p>
      )}

      {!unavailable && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-400">Миний түүх</h2>
          {me.loading ? (
            <p className="text-sm text-slate-500">Ачаалж байна…</p>
          ) : me.data?.available === false || !me.data ? (
            <p className="text-sm text-slate-500">Мэдээлэл алга.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-center">
              <Stat label="Тоглолт" value={me.data.gamesPlayed} />
              <Stat label="Ялалт" value={me.data.wins} />
              <Stat label="Ялалтын хувь" value={`${Math.round((me.data.winRate ?? 0) * 100)}%`} />
              <Stat label="Нийт орлого" value={fmt(me.data.totalPayout)} />
            </div>
          )}
        </section>
      )}

      {!unavailable && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-400">Тэргүүлэгчид</h2>
          {leaderboard.loading ? (
            <p className="text-sm text-slate-500">Ачаалж байна…</p>
          ) : !leaderboard.data?.players?.length ? (
            <p className="text-sm text-slate-500">Одоогоор тоглолт дуусаагүй байна.</p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {leaderboard.data.players.map((p, i) => (
                <li
                  key={p.player_id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ${
                    p.player_id === session.playerId ? 'bg-amber-400/10 ring-amber-300/40' : 'bg-slate-800 ring-white/5'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 text-right font-mono text-slate-500">{i + 1}</span>
                    <span className="font-semibold">{p.nickname}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-slate-400">
                    <span>🏆 {p.wins}</span>
                    <span className="font-mono text-emerald-300">{fmt(p.total_payout)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-800 px-3 py-3 ring-1 ring-white/5">
      <p className="font-mono text-lg font-bold">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
