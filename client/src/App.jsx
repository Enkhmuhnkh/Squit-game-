import { useEffect } from 'react';
import { useGameStore } from './store/useGameStore.js';
import Home from './pages/Home.jsx';
import Lobby from './pages/Lobby.jsx';
import Room from './pages/Room.jsx';

export default function App() {
  const session = useGameStore((s) => s.session);
  const room = useGameStore((s) => s.room);
  const connected = useGameStore((s) => s.connected);
  const notice = useGameStore((s) => s.notice);
  const restoring = useGameStore((s) => s.restoring);
  const boot = useGameStore((s) => s.boot);

  useEffect(() => { boot(); }, [boot]);

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-950 to-slate-900">
      {!connected && (
        <div className="bg-amber-500/90 text-black text-center text-sm py-1">Серверт холбогдож байна…</div>
      )}
      {notice && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 rounded-full bg-slate-800 px-4 py-2 text-sm shadow-lg ring-1 ring-white/10">
          {notice}
        </div>
      )}
      {!session && restoring ? (
        <p className="pt-40 text-center text-slate-400">Таны өрөөг сэргээж байна…</p>
      ) : !session ? <Home /> : !room ? <Lobby /> : <Room />}
    </div>
  );
}
