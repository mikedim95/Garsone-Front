// MQTT client wrapper with wildcard-aware subscriptions and a mock fallback.

type MQTTCallback = (message: any) => void;

// Prefer EMQX_* names; fall back to legacy VITE_MQTT_* if present
const ENV: any = (import.meta as any).env || {};
const BROKER_URL = ENV.VITE_EMQX_URL ?? ENV.VITE_MQTT_URL ?? 'ws://localhost:1883';

type Role = 'waiter' | 'cook' | 'manager' | 'customer' | 'guest';

function getRole(): Role {
  try {
    const v = (localStorage.getItem('ROLE') || 'guest').toLowerCase();
    if (v === 'waiter' || v === 'cook' || v === 'manager' || v === 'customer') return v as Role;
    return 'guest';
  } catch {
    return 'guest';
  }
}

function credsForRole(role: Role): { username?: string; password?: string } {
  // Role-scoped creds: VITE_EMQX_USERNAME_WAITER, etc. (falls back to generic)
  const mapKey = (name: string) => name.replace(/-/g, '_').toUpperCase();
  const r = mapKey(role);
  const user = ENV[`VITE_EMQX_USERNAME_${r}`] ?? ENV[`VITE_MQTT_USERNAME_${r}`] ?? ENV.VITE_EMQX_USERNAME ?? ENV.VITE_MQTT_USERNAME;
  const pass = ENV[`VITE_EMQX_PASSWORD_${r}`] ?? ENV[`VITE_MQTT_PASSWORD_${r}`] ?? ENV.VITE_EMQX_PASSWORD ?? ENV.VITE_MQTT_PASSWORD;
  return { username: user, password: pass };
}
function getClientId(): string {
  try {
    // Stable per-tab id
    let tabId = sessionStorage.getItem('MQTT_TAB_ID');
    if (!tabId) {
      tabId = Math.random().toString(16).slice(2, 10);
      sessionStorage.setItem('MQTT_TAB_ID', tabId);
    }
    const clientPrefix = localStorage.getItem('CLIENT_PREFIX');
    const slug = localStorage.getItem('STORE_SLUG') || 'store';
    const role = localStorage.getItem('ROLE') || 'guest';
    const env = (typeof window !== 'undefined' && /onrender|vercel|netlify/i.test(window.location.hostname)) ? 'prod' : 'local';
    // Convention default: {store}:{front|back}:{local|prod}:{role}:{rand}
    if (clientPrefix && clientPrefix.trim().length > 0) {
      // Landing page specific: {prefix}:front:{local|prod}:{rand}
      return `${clientPrefix}:front:${env}:${tabId}`;
    }
    return `${slug}:front:${env}:${role}:${tabId}`;
  } catch {
    return `store:front:local:guest:${Math.random().toString(16).slice(2)}`;
  }
}

function topicMatches(filter: string, topic: string): boolean {
  if (filter === topic) return true;
  const f = filter.split('/');
  const t = topic.split('/');
  const fl = f.length;
  const tl = t.length;
  for (let i = 0, j = 0; i < fl && j < tl; i++, j++) {
    const fp = f[i];
    const tp = t[j];
    if (fp === '#') return true; // multi-level wildcard
    if (fp === '+') continue; // single-level wildcard
    if (fp !== tp) return false;
  }
  return fl === tl || f[fl - 1] === '#';
}

class MockMQTTService {
  private subscribers: Map<string, MQTTCallback[]> = new Map();
  private connected = false;

  async connect() {
    if (appOffline()) {
      // app is explicitly offline — ensure disconnected status
      try { window.dispatchEvent(new CustomEvent('mqtt-status', { detail: { connected: false, mock: true } })); } catch {}
      return;
    }
    this.connected = true;
    try { window.dispatchEvent(new CustomEvent('mqtt-status', { detail: { connected: true, mock: true } })); } catch {}
  }

  subscribe(topic: string, callback: MQTTCallback) {
    if (!this.subscribers.has(topic)) this.subscribers.set(topic, []);
    const arr = this.subscribers.get(topic)!;
    if (!arr.includes(callback)) arr.push(callback);
  }

  publish(topic: string, message: any) {
    setTimeout(() => {
      for (const [filter, cbs] of this.subscribers.entries()) {
        if (topicMatches(filter, topic)) cbs.forEach((cb) => cb(message));
      }
    }, 0);
  }

  unsubscribe(topic: string) {
    this.subscribers.delete(topic);
  }

  disconnect() {
    this.connected = false;
    this.subscribers.clear();
    try { window.dispatchEvent(new CustomEvent('mqtt-status', { detail: { connected: false, mock: true } })); } catch {}
  }

  isConnected() {
    return this.connected;
  }
}

class RealMQTTService {
  private client: any | null = null;
  private subscribers: Map<string, MQTTCallback[]> = new Map();
  private connected = false;
  private boundOnExternal?: () => void;

  constructor() {
    if (typeof window !== 'undefined') {
      this.boundOnExternal = () => {
        try { this.forceReconnect(); } catch {}
      };
      window.addEventListener('role-changed', this.boundOnExternal as any);
      window.addEventListener('store-slug-changed', this.boundOnExternal as any);
    }
  }

  public forceReconnect() {
    try { this.client?.end(true); } catch {}
    this.client = null;
    this.connected = false;
    // keep subscribers map; re-connect will re-subscribe
    this.connect().catch(() => {});
  }

  async connect() {
    if (appOffline()) {
      try { window.dispatchEvent(new CustomEvent('mqtt-status', { detail: { connected: false } })); } catch {}
      return;
    }
    if (this.client) return;
    const mod: any = await import('mqtt');
    const connectFn: any = mod.connect || mod.default?.connect || mod.default;
    const role = getRole();
    const { username, password } = credsForRole(role);
    this.client = connectFn(BROKER_URL, {
      clientId: getClientId(),
      username,
      password,
      clean: true,
      reconnectPeriod: 1000,
    });

    this.client.on('connect', () => {
      this.connected = true;
      try { window.dispatchEvent(new CustomEvent('mqtt-status', { detail: { connected: true } })); } catch {}
    });
    const onDown = () => {
      this.connected = false;
      try { window.dispatchEvent(new CustomEvent('mqtt-status', { detail: { connected: false } })); } catch {}
    };
    this.client.on('close', onDown);
    this.client.on('offline', onDown);
    this.client.on('end', onDown);
    // Keep 'error' informational; don't flip status here because mqtt.js will often reconnect immediately
    this.client.on('error', () => {
      try { window.dispatchEvent(new CustomEvent('mqtt-status', { detail: { connected: this.connected } })); } catch {}
    });

    this.client.on('message', (topic: string, payload: Uint8Array) => {
      const str = new TextDecoder().decode(payload);
      let msg: any = str;
      try {
        msg = JSON.parse(str);
      } catch {}
      for (const [filter, cbs] of this.subscribers.entries()) {
        if (topicMatches(filter, topic)) cbs.forEach((cb) => cb(msg));
      }
    });

    // Re-subscribe existing topics on new client
    for (const topic of this.subscribers.keys()) {
      try { this.client.subscribe(topic, { qos: 1 }); } catch {}
    }
  }

  subscribe(topic: string, callback: MQTTCallback) {
    if (!this.subscribers.has(topic)) this.subscribers.set(topic, []);
    const arr = this.subscribers.get(topic)!;
    if (!arr.includes(callback)) arr.push(callback);
    this.client?.subscribe(topic, { qos: 1 });
  }

  publish(topic: string, message: any) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    this.client?.publish(topic, payload, { qos: 1 });
  }

  unsubscribe(topic: string) {
    this.subscribers.delete(topic);
    this.client?.unsubscribe(topic);
  }

  disconnect() {
    this.client?.end(true);
    this.client = null;
    this.subscribers.clear();
    try { window.dispatchEvent(new CustomEvent('mqtt-status', { detail: { connected: false } })); } catch {}
  }

  isConnected() {
    if (appOffline()) return false;
    return this.connected || (!!this.client && this.client.connected);
  }
}

let mqttServiceImpl: MockMQTTService | RealMQTTService = new MockMQTTService();

export const mqttService = {
  async connect() {
    if (appOffline()) {
      try { window.dispatchEvent(new CustomEvent('mqtt-status', { detail: { connected: false } })); } catch {}
      return;
    }
    if (!(mqttServiceImpl instanceof RealMQTTService)) {
      try {
        const real = new RealMQTTService();
        await real.connect();
        mqttServiceImpl = real;
      } catch {
        // Stay in mock mode but mark as disconnected (no auto connect)
        mqttServiceImpl = new MockMQTTService();
        return;
      }
    }
  },
  subscribe(topic: string, cb: MQTTCallback) {
    mqttServiceImpl.subscribe(topic, cb);
  },
  publish(topic: string, message: any) {
    mqttServiceImpl.publish(topic, message);
  },
  unsubscribe(topic: string) {
    mqttServiceImpl.unsubscribe(topic);
  },
  disconnect() {
    mqttServiceImpl.disconnect();
  },
  isConnected() {
    return mqttServiceImpl.isConnected();
  },
};
function appOffline(): boolean {
  try { if (localStorage.getItem('OFFLINE') === '1') return true; } catch {}
  const v = (import.meta as any).env?.VITE_OFFLINE;
  return String(v ?? '').toLowerCase() === '1' || String(v ?? '').toLowerCase() === 'true';
}

