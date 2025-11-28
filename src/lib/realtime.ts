import { useAuthStore } from "@/store/authStore";
import { API_BASE, isOffline as apiIsOffline } from "./api";

type RealtimeMessage = unknown; // Messages vary per topic; callers narrow as needed.
type RealtimeCallback = (message: RealtimeMessage) => void;

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

type LandingAwareWindow = Window & { __OF_LANDING__?: boolean };

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

  publish(topic: string, message: RealtimeMessage) {
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
    } catch (error) {
      console.warn("Mock realtime status dispatch failed", error);
    }
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
    this.connect().catch((error) => {
      console.warn("Realtime subscribe connect attempt failed", error);
    });
  }

  publish(topic: string, message: RealtimeMessage) {
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
        let err: unknown = null;
        try {
          err = await res.json();
        } catch (parseError) {
          console.warn("Realtime publish error payload parse failed", parseError);
        }
        const errorMessage =
          (typeof err === "object" &&
            err !== null &&
            typeof (err as { error?: unknown }).error === "string" &&
            (err as { error: string }).error) ||
          (typeof err === "object" &&
            err !== null &&
            typeof (err as { message?: unknown }).message === "string" &&
            (err as { message: string }).message) ||
          "Publish failed";
        throw new Error(errorMessage);
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
      } catch (error) {
        console.warn("Realtime socket close failed", error);
      }
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
      } catch (error) {
        console.warn("Realtime socket restart close failed", error);
      }
    }
    this.socket = null;
    this.connected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connect().catch((error) => {
      console.warn("Realtime restart connect attempt failed", error);
    });
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

  private dispatch(topic: string, payload: RealtimeMessage) {
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
    } catch (error) {
      console.warn("Realtime status dispatch failed", error);
    }
  }
}

// Lightweight WebSocket client for backend WSS (no MQTT on frontend)
import { API_BASE } from './api';

type MessageHandler = (payload: any) => void;

let socket: WebSocket | null = null;
let connecting = false;
let connected = false;
const subscriptions = new Map<string, Set<MessageHandler>>();
let reconnectTimer: number | undefined;

function buildWsUrl() {
  if (!API_BASE) return null;
  try {
    const url = new URL('/events/ws', API_BASE);
    url.protocol = url.protocol.replace('http', 'ws');
    return url.toString();
  } catch (error) {
    console.error('Failed to build WS URL', error);
    return null;
  }
}

function notifyStatus(isConnected: boolean) {
  connected = isConnected;
  try {
    window.dispatchEvent(new CustomEvent('realtime-status', { detail: { connected: isConnected } }));
  } catch (error) {
    console.warn('Realtime status dispatch failed', error);
  }
}

function handleMessage(event: MessageEvent) {
  try {
    const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    const topic = parsed?.topic as string;
    const payload = parsed?.payload;
    if (!topic || !subscriptions.has(topic)) return;
    const handlers = subscriptions.get(topic)!;
    handlers.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error('Realtime handler failed', err);
      }
    });
  } catch (error) {
    console.error('Realtime message parse error', error);
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    realtimeService.connect().catch(() => {});
  }, 5000);
}

export const realtimeService = {
  async connect() {
    if (connected || connecting) return;
    const wsUrl = buildWsUrl();
    if (!wsUrl) return;
    connecting = true;
    try {
      socket = new WebSocket(wsUrl);
      socket.addEventListener('open', () => {
        connecting = false;
        notifyStatus(true);
      });
      socket.addEventListener('close', () => {
        connecting = false;
        notifyStatus(false);
        scheduleReconnect();
      });
      socket.addEventListener('error', () => {
        connecting = false;
        notifyStatus(false);
        scheduleReconnect();
      });
      socket.addEventListener('message', handleMessage);
    } catch (error) {
      connecting = false;
      notifyStatus(false);
      scheduleReconnect();
    }
  },
  subscribe(topic: string, cb: MessageHandler) {
    if (!subscriptions.has(topic)) {
      subscriptions.set(topic, new Set());
    }
    subscriptions.get(topic)!.add(cb);
  },
  publish(topic: string, message: RealtimeMessage) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify({ topic, payload: message }));
    } catch (error) {
      console.error('Realtime publish failed', error);
    }
  },
  unsubscribe(topic: string, cb?: MessageHandler) {
    if (!subscriptions.has(topic)) return;
    if (cb) {
      subscriptions.get(topic)!.delete(cb);
    } else {
      subscriptions.delete(topic);
    }
  },
  disconnect() {
    try {
      socket?.close();
    } catch {}
    socket = null;
    connecting = false;
    notifyStatus(false);
  },
  isConnected() {
    return connected;
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
  if (typeof window !== "undefined") {
    const landingWindow = window as LandingAwareWindow;
    if (landingWindow.__OF_LANDING__) {
      return true;
    }
  }
  return false;
}
