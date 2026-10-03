import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/useGameStore.js';
import { useCountdown } from '../../lib/useCountdown.js';
import { playTick } from '../../lib/sfx.js';
import ResultOverlay from '../../components/ResultOverlay.jsx';
import ReactionBar from '../../components/ReactionBar.jsx';

const fmt = (n) => `$${n.toLocaleString('en-US')}`;
const PULSE_MS = 180;

function Doll({ light }) {
  const red = light === 'RED';
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative grid h-24 w-24 place-items-center rounded-full text-4xl shadow-lg transition-colors duration-300 ${
          red ? 'bg-rose-600 ring-4 ring-rose-400/60 animate-pulse' : 'bg-emerald-600 ring-4 ring-emerald-400/40'
        }`}
        style={{ transform: red ? 'rotateY(0deg)' : 'rotateY(180deg)', transition: 'transform 500ms ease' }}
      >
        🎎
      </div>
      <p className={`font-extrabold tracking-wide ${red ? 'text-rose-400' : 'text-emerald-400'}`}>
        {red ? 'ЗОГС!' : 'ЯВ!'}
      </p>
    </div>
  );
}

export default function RedLightScreen() {
  const game = useGameStore((s) => s.game);
  const session = useGameStore((s) => s.session);
  const result = useGameStore((s) => s.result);
  const skew = useGameStore((s) => s.skew);
  const { move, dismissGame, notify } = useGameStore.getState();

  const lightSeconds = useCountdown(game.lightDeadline, skew);
  const roundSeconds = useCountdown(game.roundDeadline, skew);

  const myId = session.playerId;
  const me = game.players.find((p) => p.id === myId);
  const running = game.status === 'running';
  const active = running && !!me && me.alive && !me.finished;

  const [pressed, setPressed] = useState(false);
  const pulseRef = useRef(null);

  const pulse = () => move().catch((e) => notify(e.message));

  const start = () => {
    if (!active || pulseRef.current) return;
    setPressed(true);
    pulse();
    pulseRef.current = setInterval(pulse, PULSE_MS);
  };
  const stop = () => {
    setPressed(false);
    clearInterval(pulseRef.current);
    pulseRef.current = null;
  };

  useEffect(() => { if (!active) stop(); }, [active]);
  useEffect(() => () => clearInterval(pulseRef.current), []);

  useEffect(() => {
    if (running && lightSeconds !== null && lightSeconds > 0 && lightSeconds <= 2) playTick();
  }, [lightSeconds, running]);

  const trackLength = game.trackLength || 100;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-[#1a0c14] to-[#2b0f1e] px-4 py-3 ring-1 ring-rose-300/25">
        <div>
          <p className="text-xs text-slate-400">{running ? 'Раунд дуустал' : 'Тоглоом дууслаа'}</p>
          <p className="font-mono text-2xl font-bold">{running && roundSeconds !== null ? `${roundSeconds}s` : '🏁'}</p>
        </div>
        <Doll light={game.light ?? 'GREEN'} />
        <div className="text-right">
          <p className="text-xs text-slate-400">☠️ Death Pool</p>
          <p className="font-mono text-lg text-rose-300">{fmt(game.deathPool)}</p>
        </div>
      </header>

      <ReactionBar />

      {/* Track */}
      <section className="flex flex-col gap-2 rounded-2xl bg-[#070b1a] p-4 ring-1 ring-white/10">
        {game.players.map((p) => {
          const pct = Math.min(100, (p.progress / trackLength) * 100);
          const isMe = p.id === myId;
          const dead = !p.alive;
          return (
            <div key={p.id} className="flex items-center gap-2">
              <span className={`w-20 shrink-0 truncate text-xs ${isMe ? 'font-bold text-amber-300' : 'text-slate-400'}`}>
                {p.nickname}
              </span>
              <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-slate-800 ring-1 ring-white/5">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    dead ? 'bg-slate-600' : p.finished ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute inset-y-0 right-2 flex items-center text-[10px] text-slate-200">
                  {dead ? '💀' : p.finished ? '🏁' : `${Math.round(pct)}%`}
                </span>
              </div>
            </div>
          );
        })}
      </section>

      {/* MOVE товч */}
      <button
        disabled={!active}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        style={{ touchAction: 'none' }}
        className={`rounded-2xl py-8 text-2xl font-extrabold text-black shadow-lg transition-transform disabled:cursor-default disabled:opacity-40 ${
          pressed ? 'scale-95 bg-amber-400' : 'bg-gradient-to-b from-amber-300 to-amber-500'
        }`}
      >
        {active ? (pressed ? 'ЯВЖ БАЙНА…' : 'ДАРААД БАРЬ — MOVE') : me && !me.alive ? 'Та хасагдсан 💀' : me?.finished ? 'Та дуусгасан 🏁' : 'Хүлээж байна…'}
      </button>
      <p className="text-center text-xs text-slate-500">
        🟢 ногоон үед дараад байх зуур урагшилна. 🔴 улаан үед дарвал шууд хасагдана.
      </p>

      {result && (
        <ResultOverlay
          game={game}
          result={result}
          myId={myId}
          emptyText="Хэн ч шугамд хүрсэнгүй 💀"
          reasonText={
            result.reason === 'furthest'
              ? 'Хэн ч шугамд хүрсэнгүй — хамгийн хол очсон тоглогч Death Pool-ийг авлаа'
              : 'Шугамд хүрсэн тоглогчид Death Pool-ийг хуваалаа'
          }
          shareInfo={{
            gameName: 'Улаан гэрэл, Ногоон гэрэл',
            headline: result.winners.includes(myId)
              ? 'Шугамд хүрлээ!'
              : me?.alive
                ? `${Math.round(((me?.progress ?? 0) / trackLength) * 100)}% хүртэл хүрлээ`
                : 'Буудуулсан…',
            stat: `${Math.round(((me?.progress ?? 0) / trackLength) * 100)}% ахиц`,
          }}
          onClose={dismissGame}
        />
      )}
    </main>
  );
}
