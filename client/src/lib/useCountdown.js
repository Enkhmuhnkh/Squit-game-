import { useEffect, useState } from 'react';

/** Үлдсэн хугацааг серверийн цагтай тулган тооцно (skew-ээр засна). */
export function useCountdown(deadline, skew) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - (now + skew)) / 1000));
}
