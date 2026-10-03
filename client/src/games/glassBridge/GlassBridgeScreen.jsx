import { lazy, Suspense, useEffect, useState } from 'react';
import { useGameStore } from '../../store/useGameStore.js';
import ErrorBoundary from '../../components/ErrorBoundary.jsx';
import Bridge from './Bridge.jsx'; // 2D (CSS) хувилбар — WebGL ажиллахгүй үед fallback
import PlayerHud from './PlayerHud.jsx';
import Shop from './Shop.jsx';
import ResultOverlay from '../../components/ResultOverlay.jsx';
import ReactionBar from '../../components/ReactionBar.jsx';
import { playTick, playPurchase, playUse } from '../../lib/sfx.js';
import { useCountdown } from '../../lib/useCountdown.js';
import { detectPreferredView } from '../../lib/deviceCapability.js';

// three.js том тул зөвхөн Шилэн гүүр нээгдэхэд ачаална
const Bridge3D = lazy(() => import('./Bridge3D.jsx'));

const fmt = (n) => `$${n.toLocaleString('en-US')}`;
const VIEW_KEY = 'partyhub.gb.view';

function loadView() {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === '2d' || saved === '3d') return saved; // хэрэглэгчийн гараар сонгосон — үргэлж давамгайлна
  } catch { /* ignore */ }
  return detectPreferredView();
}
function saveView(v) {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
}

export default function GlassBridgeScreen() {
  const game = useGameStore((s) => s.game);
  const session = useGameStore((s) => s.session);
  const cheat = useGameStore((s) => s.cheat);
  const lastStep = useGameStore((s) => s.lastStep);
  const result = useGameStore((s) => s.result);
  const skew = useGameStore((s) => s.skew);
  const { choose, buy, useItem, dismissGame, notify } = useGameStore.getState();

  const [targeting, setTargeting] = useState(null); // 'swap' | 'push' | null
  const [view, setView] = useState(loadView); // '3d' | '2d'
  const seconds = useCountdown(game.deadline, skew);

  const myId = session.playerId;
  const me = game.players.find((p) => p.id === myId);
  const current = game.players.find((p) => p.id === game.currentPlayerId);
  const running = game.status === 'running';
  const myTurn = running && game.currentPlayerId === myId;
  const active = running && !!me && me.alive && !me.finished;

  // Ээлж өөрчлөгдвөл зорилтот сонголтыг цуцална
  useEffect(() => { setTargeting(null); }, [game.currentPlayerId]);

  // Сүүлийн 5 секундэд "tick" дуу
  useEffect(() => {
    if (running && seconds !== null && seconds > 0 && seconds <= 5) playTick();
  }, [seconds, running]);

  const guard = (fn) => async (...args) => {
    try { await fn(...args); } catch (e) { notify(e.message); }
  };

  const onBuy = guard(async (item) => {
    await buy(item);
    playPurchase();
  });
  const onUse = guard(async (item) => {
    if (item === 'swap' || item === 'push') return setTargeting(item);
    await useItem(item);
    playUse();
  });
  const onPickTarget = guard(async (targetId) => {
    const item = targeting;
    setTargeting(null);
    await useItem(item, targetId);
    playUse();
  });

  const switchView = (v) => { setView(v); saveView(v); };
  const bridgeProps = { game, myId, cheat, lastStep, onChoose: guard(choose) };
  const flat = <Bridge {...bridgeProps} />;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-3 py-4">
      {/* Дээд самбар */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-[#0c1630] to-[#141f3d] px-4 py-3 ring-1 ring-amber-300/25">
        <div>
          <p className="text-xs text-slate-400">{running ? 'Одоогийн ээлж' : 'Тоглоом дууслаа'}</p>
          <p className="text-lg font-bold">
            {running ? (myTurn ? 'Таны ээлж!' : current?.nickname ?? '—') : '🏁'}
          </p>
        </div>
        {running && seconds !== null && (
          <div className={`font-mono text-3xl ${seconds <= 5 ? 'text-rose-400' : 'text-amber-300'}`}>{seconds}s</div>
        )}
        <div className="text-right">
          <p className="text-xs text-slate-400">☠️ Death Pool</p>
          <p className="font-mono text-lg text-rose-300">{fmt(game.deathPool)}</p>
        </div>
      </header>

      <ReactionBar />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="flex flex-col gap-2">
          <div className="relative">
            {view === '3d' ? (
              <ErrorBoundary
                fallback={flat}
                onError={() => { switchView('2d'); notify('3D ажиллахгүй байна — 2D горимд шилжлээ'); }}
              >
                <Suspense fallback={<div className="grid h-[420px] place-items-center rounded-2xl bg-[#070b1a] text-slate-400 sm:h-[560px]">3D ачаалж байна…</div>}>
                  <Bridge3D {...bridgeProps} />
                </Suspense>
              </ErrorBoundary>
            ) : flat}
            <button
              onClick={() => switchView(view === '3d' ? '2d' : '3d')}
              className="absolute right-2 top-2 z-10 rounded-md bg-black/60 px-2 py-1 text-xs text-slate-200 ring-1 ring-white/10"
            >
              {view === '3d' ? '2D' : '3D'}
            </button>
          </div>

          {/* Гар утсанд ч дарахад хялбар том товчнууд */}
          {myTurn && me?.alive ? (
            <div className="grid grid-cols-2 gap-3">
              {['L', 'R'].map((side) => (
                <button
                  key={side}
                  onClick={guard(choose).bind(null, side)}
                  className="rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 py-3 text-lg font-extrabold text-black shadow-lg active:scale-95"
                >
                  {side === 'L' ? '◀ ЗҮҮН' : 'БАРУУН ▶'}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-slate-400">
              {me && !me.alive ? 'Та унасан. Бусдыг хараарай…' : 'Бусдын ээлжийг хүлээж байна'}
            </p>
          )}
        </section>

        <aside className="flex flex-col gap-5">
          <PlayerHud game={game} myId={myId} targeting={targeting} onPickTarget={onPickTarget} />
          <Shop
            shop={game.shop}
            items={game.me?.items}
            balance={me?.balance ?? 0}
            myTurn={myTurn}
            active={active}
            targeting={targeting}
            onBuy={onBuy}
            onUse={onUse}
            onCancelTarget={() => setTargeting(null)}
          />
        </aside>
      </div>

      {result && (
        <ResultOverlay
          game={game}
          result={result}
          myId={myId}
          emptyText="Хэн ч нэг ч шат давсангүй 💀"
          reasonText={
            result.reason === 'furthest'
              ? 'Хэн ч гүүрийг давсангүй — хамгийн хол очсон тоглогч Death Pool-ийг авлаа'
              : 'Гүүрийг давсан тоглогчид Death Pool-ийг хуваалаа'
          }
          shareInfo={{
            gameName: 'Шилэн гүүр',
            headline: result.winners.includes(myId)
              ? 'Гүүрийг давлаа!'
              : me?.finished
                ? 'Гүүрийг давлаа!'
                : `${me?.step ?? 0}-р шат хүртэл хүрлээ`,
            subline: result.winners.includes(myId) ? undefined : 'Шилэн гүүрт унасан…',
            stat: `${me?.step ?? 0} / ${game.steps} шат`,
          }}
          onClose={dismissGame}
        />
      )}
    </main>
  );
}
