import { useEffect, useMemo, useState } from 'react';
import { realtimeService } from '@/lib/realtime';

function isOffline() {
  try { if (localStorage.getItem('OFFLINE') === '1') return true; } catch {}
  const v = (import.meta as any).env?.VITE_OFFLINE;
  return String(v ?? '').toLowerCase() === '1' || String(v ?? '').toLowerCase() === 'true';
}

export const RealtimeStatus = () => {
  const [connectedNow, setConnectedNow] = useState<boolean>(realtimeService.isConnected());
  const [ts, setTs] = useState<number>(() => Date.now());
  const [lastConnected, setLastConnected] = useState<number>(() => (realtimeService.isConnected() ? Date.now() : 0));

  useEffect(() => {
    let alive = true;
    const onEvt = (e: any) => {
      if (!alive) return;
      const c = Boolean(e?.detail?.connected);
      setConnectedNow(c);
      if (c) setLastConnected(Date.now());
      setTs(Date.now());
    };
    window.addEventListener('realtime-status', onEvt as any);
    const iv = setInterval(() => {
      if (!alive) return;
      const c = realtimeService.isConnected();
      setConnectedNow(c);
      if (c) setLastConnected(Date.now());
    }, 3000);
    return () => { alive = false; window.removeEventListener('realtime-status', onEvt as any); clearInterval(iv); };
  }, []);

  const manualOffline = isOffline();
  const offline = manualOffline;
  const cls = offline ? 'bg-amber-500' : 'bg-green-500';
  const label = offline ? 'Offline' : 'Connected';

  const toggleOffline = async () => {
    const nowOffline = !isOffline();
    try {
      localStorage.setItem('OFFLINE', nowOffline ? '1' : '0');
    } catch {}
    try { window.dispatchEvent(new CustomEvent('realtime-status', { detail: { connected: !nowOffline } })); } catch {}
    setTs(Date.now());
  };

  return (
    <button
      type="button"
      onClick={toggleOffline}
      title={label + ' – click to ' + (offline ? 'go online' : 'go offline')}
      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground/80 hover:bg-accent/50 transition-colors"
    >
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />
      {label}
    </button>
  );
};
