import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useMedia(q: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Seconds since mount, updated at `fps` while `active`. */
export function useTicker(active: boolean, fps = 12): number {
  const [t, setT] = useState(0);
  const start = useRef(performance.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setT((performance.now() - start.current) / 1000), Math.round(1000 / fps));
    return () => window.clearInterval(id);
  }, [active, fps]);
  return t;
}
