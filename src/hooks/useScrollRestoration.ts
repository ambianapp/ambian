import { useEffect, useRef } from "react";

/**
 * Persists and restores scroll position for a scrollable container.
 * Uses sessionStorage so it survives tab switches and soft reloads.
 */
export const useScrollRestoration = (key: string) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const storageKey = `ambian_scroll:${key}`;

    // Restore ASAP (after mount/layout)
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      const y = Number(saved);
      if (!Number.isNaN(y)) {
        requestAnimationFrame(() => {
          el.scrollTop = y;
        });
      }
    }

    let rafId: number | null = null;
    const persist = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        sessionStorage.setItem(storageKey, String(el.scrollTop));
      });
    };

    const onScroll = () => persist();
    const onPageHide = () => persist();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persist();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key]);

  return ref;
};
