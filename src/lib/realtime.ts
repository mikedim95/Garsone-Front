import { useAuthStore } from "@/store/authStore";
import { API_BASE, isOffline as apiIsOffline } from "./api";
import { getStoredStoreSlug } from "./storeSlug";
import { RealtimeConnection } from "./realtimeConnection";
import { storedCustomerVisitToken } from "./customerVisitStorage";

type RealtimeMessage = unknown;
type MessageHandler = (payload: any) => void;
type LandingAwareWindow = Window & { __OF_LANDING__?: boolean };
const subscriptions = new Map<string, Set<MessageHandler>>();

const connection = new RealtimeConnection({
  url: buildWebSocketUrl,
  enabled: () => !appOffline() && (import.meta.env.VITE_LOCAL_ONLY === "true" || navigator.onLine !== false) && document.visibilityState !== "hidden",
  create: url => new WebSocket(url),
  status: connected => window.dispatchEvent(new CustomEvent("realtime-status", { detail: { connected } })),
  message: event => {
    try {
      const { topic, payload } = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      subscriptions.get(topic)?.forEach(callback => {
        try { callback(payload); } catch (error) { console.error("Realtime handler failed", error); }
      });
    } catch (error) { console.error("Realtime message parse failed", error); }
  },
});

export const realtimeService = {
  async connect() { if (appOffline()) connection.disconnect(); else connection.connect(); },
  subscribe(topic: string, callback: MessageHandler) {
    if (!subscriptions.has(topic)) subscriptions.set(topic, new Set());
    subscriptions.get(topic)!.add(callback);
  },
  unsubscribe(topic: string, callback?: MessageHandler) {
    if (callback) {
      subscriptions.get(topic)?.delete(callback);
      if (!subscriptions.get(topic)?.size) subscriptions.delete(topic);
    } else subscriptions.delete(topic);
  },
  publish(topic: string, message: RealtimeMessage) { connection.send(JSON.stringify({ topic, payload: message })); },
  disconnect() { connection.disconnect(); },
  isConnected() { return connection.isConnected(); },
};

if (typeof window !== "undefined") {
  const refresh = () => connection.refresh();
  const visibility = () => document.visibilityState === "hidden" ? connection.suspend() : connection.refresh();
  window.addEventListener("online", refresh);
  window.addEventListener("offline", () => import.meta.env.VITE_LOCAL_ONLY === "true" ? connection.refresh() : connection.suspend());
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);
  window.addEventListener("pagehide", () => connection.suspend());
  window.addEventListener("store-slug-changed", refresh);
  window.addEventListener("customer-visit-changed", refresh);
  document.addEventListener("visibilitychange", visibility);
  useAuthStore.subscribe((state, previous) => {
    if (state.token !== previous.token) connection.refresh();
  });
}

function buildWebSocketUrl(): string | null {
  if (!API_BASE) return null;
  const token = useAuthStore.getState().token;
  let wsBase = API_BASE;
  if (API_BASE.startsWith("https://")) {
    wsBase = API_BASE.replace("https://", "wss://");
  } else if (API_BASE.startsWith("http://")) {
    wsBase = API_BASE.replace("http://", "ws://");
  }
  const url = new URL(`${wsBase.replace(/\/+$/, "")}/events/ws`);
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const storeSlug = params.get("storeSlug") || getStoredStoreSlug();
    const tableId = window.location.pathname.match(/(?:^\/|\/table\/)([0-9a-f-]{36})(?:\/|$)/i)?.[1];
    if (storeSlug && tableId) {
      const visit = storedCustomerVisitToken(storeSlug, tableId);
      if (!visit) return null;
      url.searchParams.set("storeSlug", storeSlug);
      url.searchParams.set("tableId", tableId);
      url.searchParams.set("visit", visit);
    } else if (token) url.searchParams.set("token", token);
    else return null;
  }
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
