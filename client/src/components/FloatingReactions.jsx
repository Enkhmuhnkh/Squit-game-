import { useGameStore } from '../store/useGameStore.js';

/** Room/тоглоомын дэлгэц бүрт нэг л удаа App түвшинд байрлуулдаг — ирсэн emoji-г float анимацаар харуулна. */
export default function FloatingReactions() {
  const reactions = useGameStore((s) => s.reactions);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center">
      <div className="relative h-0 w-full max-w-sm">
        {reactions.map((r) => (
          <span
            key={r.id}
            className="absolute bottom-0 left-1/2 text-3xl"
            style={{ animation: 'partyhub-float-up 2.2s ease-out forwards', marginLeft: `${((r.id * 37) % 160) - 80}px` }}
          >
            {r.emoji}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes partyhub-float-up {
          0% { transform: translateY(0) scale(0.6); opacity: 0; }
          15% { opacity: 1; transform: translateY(-10px) scale(1.15); }
          100% { transform: translateY(-160px) scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
