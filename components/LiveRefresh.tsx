"use client";
import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

/** Runs `check` whenever the page is shown again: returning with Back, switching back from another app
 *  or tab, or the window regaining focus. The browser (and Next's router cache) can restore a page
 *  exactly as it first loaded, so without this a paid order could still look unpaid. */
export function useWhenShown(check: () => void, everyMs?: number) {
  useEffect(() => {
    const again = () => { if (document.visibilityState === "visible") check(); };
    check(); // a restored page may be out of date already
    addEventListener("pageshow", again); addEventListener("focus", again); addEventListener("popstate", again);
    document.addEventListener("visibilitychange", again);
    const timer = everyMs ? setInterval(again, everyMs) : undefined;
    return () => {
      removeEventListener("pageshow", again); removeEventListener("focus", again); removeEventListener("popstate", again);
      document.removeEventListener("visibilitychange", again);
      clearInterval(timer);
    };
  }, [check, everyMs]);
}

/** Re-renders a server page with fresh data whenever it's shown, and every few seconds while `live`. */
export default function LiveRefresh({ live }: { live: boolean }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]); // stable, so the listeners aren't re-added every render
  useWhenShown(refresh, live ? 5000 : undefined);
  return null;
}
