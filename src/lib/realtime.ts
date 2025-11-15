import { useAuthStore } from "@/store/authStore";
import { API_BASE, isOffline as apiIsOffline } from "./api";

type RealtimeCallback = (message: any) => void;

function topicMatches(filter: string, topic: string): boolean {
  if (filter === topic) return true;
  const f = filter.split("/");
  const t = topic.split("/");
  const fl = f.length;
  const tl = t.length;
  for (let i = 0, j = 0; i < fl && j < tl; i += 1, j += 1) {
    const fp = f[i];
    const tp = t[j];
    if (fp === "#") return true;
    if (fp === "+") continue;
    if (fp !== tp) return false;
  }
  return fl === tl || f[fl - 1] === "#";
}

class MockRealtimeService {
  private subscribers: Map<string, RealtimeCallback[]> = new Map();
  private connected = false;

  async connect() {
    if (appOffline()) {
      this.connected = false;
      this.dispatchStatus();
      return;
    }
    this.connected = true;
    this.dispatchStatus();
  }

  subscribe(topic: string, callback: RealtimeCallback) {
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
    return Promise.resolve();
  }

  unsubscribe(topic: string) {
    this.subscribers.delete(topic);
  }

  disconnect() {
    this.connected = false;
    this.subscribers.clear();
    this.dispatchStatus();
  }

  isConnected() {
    return this.connected;
  }

  private dispatchStatus() {
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(
        new CustomEvent("realtime-status", {
          detail: { connected: this.connected, mock: true },
        })
      );
    } catch {}
  }
}

type TopicRegistry = Map<string, Set<RealtimeCallback>>;

class WebSocketRealtimeService {
  private socket: WebSocket | null = null;
  private topics: TopicRegistry = new Map();
  private reconnectTimer: number | null = null;
  private connected = false;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("role-changed", () => this.restart());
      window.addEventListener("storage", (evt) => {
        if (evt.key === "OFFLINE") this.restart();
      });
    }
  }

  async connect() {
    if (appOffline()) {
      this.disconnect();
      return;
    }
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.openSocket();
  }

  subscribe(topic: string, cb: RealtimeCallback) {
    if (!this.topics.has(topic)) this.topics.set(topic, new Set());
    this.topics.get(topic)!.add(cb);
    this.connect().catch(() => {});
  }

  publish(topic: string, message: any) {
    const token = useAuthStore.getState().token;
    if (appOffline() || !API_BASE) {
      return Promise.reject(new Error("Offline"));
    }
    return fetch(`${API_BASE}/events/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ topic, payload: message }),
    }).then(async (res) => {
      if (!res.ok) {
        let err: any = {};
        try {
          err = await res.json();
        } catch {}
        throw new Error(err?.error || err?.message || "Publish failed");
      }
    });
  }

  unsubscribe(topic: string) {
    const listeners = this.topics.get(topic);
    if (!listeners) return;
    listeners.clear();
    this.topics.delete(topic);
  }

  disconnect() {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
    }
    this.socket = null;
    this.connected = false;
    this.notifyStatus();
  }

  isConnected() {
    return this.connected;
  }

  private restart() {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
    }
    this.socket = null;
    this.connected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connect().catch(() => {});
  }

  private openSocket() {
    if (typeof window === "undefined") return;
    const url = buildWebSocketUrl();
    if (!url) return;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.connected = true;
      this.notifyStatus();
    };

    this.socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        const topic = parsed?.topic ?? "";
        const payload = parsed?.payload;
        this.dispatch(topic, payload);
      } catch (err) {
        console.error("Realtime message parse failed", err);
      }
    };

    this.socket.onclose = () => {
      this.connected = false;
      this.notifyStatus();
      if (appOffline()) return;
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = window.setTimeout(() => this.openSocket(), 2500);
    };

    this.socket.onerror = () => {
      this.connected = false;
      this.notifyStatus();
    };
  }

  private dispatch(topic: string, payload: any) {
    for (const [filter, callbacks] of this.topics.entries()) {
      if (!callbacks.size) continue;
      if (!topicMatches(filter, topic)) continue;
      callbacks.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error("Realtime callback failed", err);
        }
      });
    }
  }

  private notifyStatus() {
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(
        new CustomEvent("realtime-status", {
          detail: { connected: this.connected },
        })
      );
    } catch {}
  }
}

let realtimeServiceImpl: MockRealtimeService | WebSocketRealtimeService =
  new MockRealtimeService();

export const realtimeService = {
  async connect() {
    if (appOffline()) {
      realtimeServiceImpl = new MockRealtimeService();
      try {
        window.dispatchEvent(
          new CustomEvent("realtime-status", { detail: { connected: false } })
        );
      } catch {}
      return;
    }
    if (!(realtimeServiceImpl instanceof WebSocketRealtimeService)) {
      realtimeServiceImpl = new WebSocketRealtimeService();
    }
    await realtimeServiceImpl.connect();
  },
  subscribe(topic: string, cb: RealtimeCallback) {
    realtimeServiceImpl.subscribe(topic, cb);
  },
  publish(topic: string, message: any) {
    return realtimeServiceImpl.publish(topic, message);
  },
  unsubscribe(topic: string) {
    realtimeServiceImpl.unsubscribe(topic);
  },
  disconnect() {
    realtimeServiceImpl.disconnect();
  },
  isConnected() {
    return realtimeServiceImpl.isConnected();
  },
};

function buildWebSocketUrl(): string | null {
  if (!API_BASE) return null;
  const token = useAuthStore.getState().token;
  let wsBase = API_BASE;
  if (API_BASE.startsWith("https://")) {
    wsBase = API_BASE.replace("https://", "wss://");
  } else if (API_BASE.startsWith("http://")) {
    wsBase = API_BASE.replace("http://", "ws://");
  }
  const url = new URL("/events/ws", wsBase);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

function appOffline(): boolean {
  if (apiIsOffline()) return true;
  if (typeof window !== "undefined" && (window as any).__OF_LANDING__) {
    return true;
  }
  return false;
}
