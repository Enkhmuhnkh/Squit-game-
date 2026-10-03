import { useEffect, useRef } from 'react';
import { playCrack, playStep } from '../../lib/sfx.js';

const ROW_H = 96;          // нэг шатны өндөр (px)
const VIEW_H = 460;        // харагдах цонхны өндөр
const PANE = 'h-[72px] w-[96px]';

function paneState({ n, side, revealed, cheat }) {
  const safeSide = revealed[n - 1];
  if (safeSide) return safeSide === side ? 'safe' : 'broken';
  if (cheat && cheat.step === n && cheat.safeSide === side) return 'cheat'; // зөвхөн надад
  return 'unknown';
}

const PANE_STYLES = {
  unknown: 'bg-sky-300/25 ring-sky-200/50 backdrop-blur-sm',
  safe: 'bg-emerald-400/30 ring-emerald-300/70',
  cheat: 'bg-emerald-400/50 ring-emerald-300 pane-cheat',
  broken: 'pane-broken bg-sky-300/25 ring-sky-200/50',
};

function Pane({ state, clickable, onClick, label }) {
  if (state === 'broken') {
    // Хагарсны дараа цоорхой үлдэнэ
    return (
      <div className={`relative ${PANE}`}>
        <div className="absolute inset-0 rounded-md bg-black/70 ring-1 ring-slate-700" />
        <div className={`absolute inset-0 rounded-md ${PANE_STYLES.broken}`} />
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      aria-label={label}
      className={`${PANE} rounded-md ring-2 transition-transform ${PANE_STYLES[state]} ${
        clickable ? 'cursor-pointer hover:-translate-y-1 hover:brightness-125' : 'cursor-default'
      }`}
      style={{ boxShadow: '0 10px 0 rgba(15,23,42,.65)' }} // "зузаан шил" мэт
    />
  );
}

function Token({ player, isMe, offset }) {
  return (
    <div
      className={`absolute top-1/2 z-10 -translate-y-1/2 transition-all duration-700 ${
        player.alive ? '' : 'opacity-30 grayscale'
      }`}
      style={{ left: `calc(50% + ${offset}px)` }}
    >
      <div
        className={`-translate-x-1/2 rounded-full px-2 py-1 text-[11px] font-bold shadow-lg ${
          isMe ? 'bg-amber-400 text-black' : 'bg-slate-100 text-slate-900'
        }`}
        // Токенууд самбарын эргэлтийг нөхөж босоо харагдана
        style={{ transform: 'rotateZ(28deg) rotateX(-58deg)' }}
      >
        {player.nickname.slice(0, 6)}
      </div>
    </div>
  );
}

export default function Bridge({ game, myId, cheat, lastStep, onChoose }) {
  const steps = game.steps;
  const me = game.players.find((p) => p.id === myId);
  const current = game.players.find((p) => p.id === game.currentPlayerId);
  const myTurn = game.status === 'running' && game.currentPlayerId === myId;
  const focusStep = current?.step ?? 0; // камер ээлж авсан тоглогчийг дагана

  // Дуу: хэн нэгний гишгэлт бүрт
  const lastId = useRef(null);
  useEffect(() => {
    if (!lastStep || lastStep.id === lastId.current) return;
    lastId.current = lastStep.id;
    if (lastStep.safe) playStep();
    else playCrack(); // Shield-ээр аврагдсан ч шил хагарна
  }, [lastStep]);

  const row0Center = steps * ROW_H + ROW_H / 2;
  const rows = [];
  for (let n = steps; n >= 0; n--) rows.push(n);

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-indigo-950 via-slate-900 to-black ring-1 ring-white/10"
      style={{ height: VIEW_H, perspective: '1100px' }}
    >
      <div
        className="absolute left-1/2 -ml-[130px] w-[260px]"
        style={{
          top: VIEW_H / 2 - row0Center,
          height: (steps + 1) * ROW_H,
          transformStyle: 'preserve-3d',
          transformOrigin: `50% ${row0Center}px`,
          // Isometric өнцөг + камер урагшаа гулсах (translateY нь эргэлтийн дараах локал тэнхлэг дээр)
          transform: `rotateX(58deg) rotateZ(-28deg) translateY(${focusStep * ROW_H}px)`,
          transition: 'transform 900ms cubic-bezier(.4,0,.2,1)',
        }}
      >
        {rows.map((n) => {
          const here = game.players.filter((p) => p.step === n);
          const isMyNext = me && myTurn && me.alive && n === me.step + 1;
          return (
            <div
              key={n}
              className="relative flex items-center justify-center gap-4"
              style={{ height: ROW_H }}
            >
              {n === 0 ? (
                <div className="flex h-[84px] w-full items-center justify-center rounded-lg bg-slate-700/80 text-sm font-semibold tracking-widest text-slate-300 ring-1 ring-white/10">
                  START
                </div>
              ) : (
                ['L', 'R'].map((side) => {
                  const state = paneState({ n, side, revealed: game.revealed, cheat });
                  return (
                    <Pane
                      key={side}
                      state={state}
                      label={`Шат ${n} ${side}`}
                      clickable={isMyNext && state !== 'broken' && game.revealed[n - 1] == null}
                      onClick={() => onChoose(side)}
                    />
                  );
                })
              )}

              {n > 0 && (
                <span
                  className="absolute -left-8 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500"
                  style={{ transform: 'translateY(-50%) rotateZ(28deg)' }}
                >
                  {n}
                </span>
              )}

              {here.map((p, i) => {
                // Алхсан тал дээр нь (ил болсон Safe), эхлэл дээр төвд нь
                const safe = n > 0 ? game.revealed[n - 1] : null;
                const base = safe === 'L' ? -56 : safe === 'R' ? 56 : 0;
                const spread = (i - (here.length - 1) / 2) * 18;
                return <Token key={p.id} player={p} isMe={p.id === myId} offset={base + spread} />;
              })}
            </div>
          );
        })}
      </div>

      {/* Дээд талын уусгах сүүдэр */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950 to-transparent" />
    </div>
  );
}
