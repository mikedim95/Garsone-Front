import { useEffect, useState } from "react";

// A WebSocket reconnect gives no replay guarantee. Refresh authoritative snapshots
// after waking a phone, returning to the venue Wi-Fi, or opening a fresh socket.
export function useRecoveryVersion(enabled = true): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      // WAN connectivity hints do not describe reachability of the venue's local Pi.
      if (document.visibilityState === "hidden" || (import.meta.env.VITE_LOCAL_ONLY !== "true" && navigator.onLine === false)) return;
      clearTimeout(timer);
      timer = setTimeout(() => setVersion(value => value + 1), 250);
    };
    const onStatus = (event: Event) => {
      if ((event as CustomEvent<{ connected: boolean }>).detail?.connected) refresh();
    };
    window.addEventListener("realtime-status", onStatus);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    // Also heal a silently stalled socket without requiring a browser reload.
    const interval = setInterval(refresh, 30_000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("realtime-status", onStatus);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled]);
  return version;
}
