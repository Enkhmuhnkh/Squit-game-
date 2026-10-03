import { useGameStore } from '../store/useGameStore.js';

const EMOJIS = ['👍', '😂', '😱', '🔥', '👏', '💀'];

/** Lobby болон тоглоомын дэлгэц хоёуланд ашиглагддаг жижиг emoji reaction мөр. */
export default function ReactionBar() {
  const { react } = useGameStore.getState();
  return (
    <div className="flex items-center justify-center gap-1.5">
      {EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => react(e)}
          className="rounded-full bg-slate-800/80 px-2.5 py-1.5 text-lg ring-1 ring-white/10 transition-transform active:scale-90"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
