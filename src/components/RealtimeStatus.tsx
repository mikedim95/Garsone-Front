import { useEffect, useState } from 'react';
import {
  isOfflineModeAllowed,
  isOfflineModeEnabled,
  writeOfflineStorageFlag,
} from '@/lib/offlineMode';
import { realtimeService } from '@/lib/realtime';

type RealtimeStatusDetail = { connected: boolean };
type RealtimeStatusEvent = CustomEvent<RealtimeStatusDetail>;

export const RealtimeStatus = () => {
  const offlineModeAllowed = isOfflineModeAllowed();
  const [connectedNow, setConnectedNow] = useState<boolean>(realtimeService.isConnected());
  const [, setTick] = useState<number>(() => Date.now());
  const [lastConnected, setLastConnected] = useState<number>(() => (realtimeService.isConnected() ? Date.now() : 0));

  useEffect(() => {
    let alive = true;
    const handleStatus = (event: Event) => {
      if (!alive) return;
      const detail = (event as RealtimeStatusEvent).detail;
      const isConnected = Boolean(detail?.connected);
      setConnectedNow(isConnected);
      if (isConnected) setLastConnected(Date.now());
      setTick(Date.now());
    };

    window.addEventListener('realtime-status', handleStatus as EventListener);
    const poll = setInterval(() => {
      if (!alive) return;
      const isConnected = realtimeService.isConnected();
      setConnectedNow(isConnected);
      if (isConnected) setLastConnected(Date.now());
    }, 3000);

    return () => {
      alive = false;
      window.removeEventListener('realtime-status', handleStatus as EventListener);
      clearInterval(poll);
    };
  }, []);

  const offline = isOfflineModeEnabled();
  const cls = offline ? 'bg-destructive' : 'bg-primary';
  const label = offline ? 'Offline' : 'Connected';

  const toggleOffline = () => {
    if (!offlineModeAllowed) return;
    const nowOffline = !isOfflineModeEnabled();
    if (!writeOfflineStorageFlag(nowOffline)) return;
    try {
      window.dispatchEvent(new CustomEvent<RealtimeStatusDetail>('realtime-status', { detail: { connected: !nowOffline } }));
    } catch (error) {
      console.warn('Failed to dispatch realtime-status event', error);
    }
    setTick(Date.now());
  };

  if (!offlineModeAllowed) return null;

  return (
    <button
      type="button"
      onClick={toggleOffline}
      title={`${label} – click to ${offline ? 'go online' : 'go offline'}`}
      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground/80 hover:bg-accent/50 transition-colors"
    >
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />
      {label}
    </button>
  );
};
