import { useEffect, useMemo, useState } from 'react';
import { mqttService } from '@/lib/mqtt';

function isOffline() {
  try { if (localStorage.getItem('OFFLINE') === '1') return true; } catch {}
  const v = (import.meta as any).env?.VITE_OFFLINE;
  return String(v ?? '').toLowerCase() === '1' || String(v ?? '').toLowerCase() === 'true';
}

export const MqttStatus = () => {
  const [connectedNow, setConnectedNow] = useState<boolean>(mqttService.isConnected());
  const [ts, setTs] = useState<number>(() => Date.now());
  const [lastConnected, setLastConnected] = useState<number>(() => (mqttService.isConnected() ? Date.now() : 0));

  useEffect(() => {
    let alive = true;
    // Do not auto-connect here; act only as a toggle indicator
    const onEvt = (e: any) => {
      if (!alive) return;
      const c = Boolean(e?.detail?.connected);
      setConnectedNow(c);
      if (c) setLastConnected(Date.now());
      setTs(Date.now());
    };
    window.addEventListener('mqtt-status', onEvt as any);
    const iv = setInterval(() => {
      if (!alive) return;
      const c = mqttService.isConnected();
      setConnectedNow(c);
      if (c) setLastConnected(Date.now());
    }, 3000);
    return () => { alive = false; window.removeEventListener('mqtt-status', onEvt as any); clearInterval(iv); };
  }, []);

  const manualOffline = isOffline();
  // For this UX: default to "Connected" unless user explicitly toggled offline
  const offline = manualOffline;
  const cls = offline ? 'bg-amber-500' : 'bg-green-500';
  const label = offline ? 'Offline' : 'Connected';

  const toggleOffline = async () => {
    const nowOffline = !isOffline();
    try {
      localStorage.setItem('OFFLINE', nowOffline ? '1' : '0');
    } catch {}
    // dashboards handle connection after login\n    try { window.dispatchEvent(new CustomEvent('mqtt-status', { detail: { connected: !nowOffline } })); } catch {}
    setTs(Date.now());
  };

  return (
    <button
      type="button"
      onClick={toggleOffline}
      title={label + ' — click to ' + (offline ? 'go online' : 'go offline')}
      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground/80 hover:bg-accent/50 transition-colors"
    >
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />
      {label}
    </button>
  );
};

