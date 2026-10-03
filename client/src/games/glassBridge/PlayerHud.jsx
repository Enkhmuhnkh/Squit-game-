const fmt = (n) => `$${n.toLocaleString('en-US')}`;

/**
 * Тоглогчдын жагсаалт. targeting байвал (swap/push) сонгох боломжтой тоглогчдыг товчтой харуулна.
 * Шалгалтыг сервер дахин хийнэ — энд зөвхөн UI-н тусламж.
 */
export default function PlayerHud({ game, myId, targeting, onPickTarget }) {
  const me = game.players.find((p) => p.id === myId);
  const myPos = game.turnOrder.indexOf(myId);

  function eligible(p) {
    if (!targeting || p.id === myId || !p.alive || p.finished) return false;
    if (targeting === 'swap') return game.turnOrder.indexOf(p.id) > myPos; // ард байгаа
    if (targeting === 'push') return me && p.step > me.step;               // урд (илүү өндөр шат)
    return false;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {game.players.map((p) => {
        const isTurn = game.currentPlayerId === p.id && game.status === 'running';
        const can = eligible(p);
        return (
          <li
            key={p.id}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ${
              isTurn ? 'bg-amber-400/15 ring-amber-300' : 'bg-slate-800 ring-white/5'
            } ${p.alive ? '' : 'opacity-50'}`}
          >
            <span className="flex items-center gap-2">
              <span>{p.alive ? (p.finished ? '🏁' : '🙂') : '💀'}</span>
              <span className={p.id === myId ? 'font-bold text-amber-300' : ''}>{p.nickname}</span>
              {isTurn && <span className="text-xs text-amber-300">ээлж</span>}
            </span>
            <span className="flex items-center gap-3 text-xs text-slate-300">
              <span>шат {p.step}</span>
              <span className="font-mono">{fmt(p.balance)}</span>
              {can && (
                <button
                  onClick={() => onPickTarget(p.id)}
                  className="rounded bg-rose-500 px-2 py-0.5 font-semibold text-white"
                >
                  Сонгох
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
