import { useState } from 'react';
import { shareResultCard } from '../lib/shareCard.js';
import { playVictory, playElimination } from '../lib/sfx.js';
import { useEffect } from 'react';

const fmt = (n) => `$${n.toLocaleString('en-US')}`;

/**
 * Тоглоом дууссаны ялагч/үр дүнгийн popup. Glass Bridge, Red Light/Green Light
 * хоёул ашигладаг shared компонент.
 *
 * @param {{
 *   game: { players: {id:string, nickname:string}[] },
 *   result: { winners: string[], payouts: Record<string, number>, reason: string },
 *   emptyText: string,            // хэн ч яллаагүй үед
 *   reasonText: string,           // яллах үед дүрмийн тайлбар
 *   myId: string,
 *   shareInfo: { gameName: string, headline: string, subline?: string, stat?: string }, // миний share card-ийн агуулга
 *   onClose: () => void,
 * }} props
 */
export default function ResultOverlay({ game, result, emptyText, reasonText, myId, shareInfo, onClose }) {
  const [sharing, setSharing] = useState(false);
  const name = (id) => game.players.find((p) => p.id === id)?.nickname ?? '?';
  const won = result.winners.includes(myId);

  useEffect(() => {
    if (won) playVictory(); else playElimination();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onShare() {
    setSharing(true);
    try {
      await shareResultCard({ ...shareInfo, nickname: name(myId), won });
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 text-center ring-1 ring-amber-300/30">
        <h2 className="text-2xl font-bold">Тоглоом дууслаа</h2>
        {result.winners.length === 0 ? (
          <p className="mt-3 text-slate-300">{emptyText}</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-400">{reasonText}</p>
            <ul className="mt-4 flex flex-col gap-2">
              {result.winners.map((id) => (
                <li key={id} className="rounded-lg bg-emerald-500/15 px-3 py-2">
                  🏆 <b>{name(id)}</b>
                  <span className="ml-2 font-mono text-emerald-300">+{fmt(result.payouts[id] ?? 0)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {shareInfo && (
          <button
            onClick={onShare}
            disabled={sharing}
            className="mt-5 w-full rounded-lg bg-slate-800 py-3 font-semibold text-slate-100 ring-1 ring-white/10 disabled:opacity-50"
          >
            {sharing ? 'Бэлдэж байна…' : '📤 Зураг болгон хуваалцах'}
          </button>
        )}

        <button onClick={onClose} className="mt-3 w-full rounded-lg bg-emerald-500 py-3 font-semibold text-black">
          Өрөө рүү буцах
        </button>
      </div>
    </div>
  );
}
