const ICONS = { cheat: '🔍', swap: '🔄', shield: '🛡️', extraTime: '⏳', push: '👈' };
const USABLE = new Set(['cheat', 'swap', 'extraTime', 'push']); // shield автоматаар ажиллана

export default function Shop({ shop, items, balance, myTurn, active, targeting, onBuy, onUse, onCancelTarget }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-400">Дэлгүүр</h3>
        <span className="font-mono text-sm">${balance.toLocaleString('en-US')}</span>
      </div>

      {targeting && (
        <div className="flex items-center justify-between rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
          <span>Жагсаалтаас зорилтот тоглогчоо сонгоно уу</span>
          <button onClick={onCancelTarget} className="underline">Болих</button>
        </div>
      )}

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Object.entries(shop).map(([id, def]) => {
          const owned = items?.[id] ?? 0;
          const canBuy = active && balance >= def.price;
          const canUse = myTurn && owned > 0 && USABLE.has(id);
          return (
            <li key={id} className="flex flex-col gap-1 rounded-lg bg-slate-800 p-3 ring-1 ring-white/5">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{ICONS[id]} {def.label}</span>
                <span className="font-mono text-xs text-slate-300">${def.price}</span>
              </div>
              <p className="text-xs text-slate-400">{def.desc}</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  disabled={!canBuy}
                  onClick={() => onBuy(id)}
                  className="rounded bg-emerald-500 px-3 py-1 text-xs font-semibold text-black disabled:opacity-30"
                >
                  Авах
                </button>
                {USABLE.has(id) && (
                  <button
                    disabled={!canUse}
                    onClick={() => onUse(id)}
                    className="rounded bg-sky-500 px-3 py-1 text-xs font-semibold text-black disabled:opacity-30"
                  >
                    Ашиглах
                  </button>
                )}
                <span className="ml-auto text-xs text-slate-400">× {owned}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
