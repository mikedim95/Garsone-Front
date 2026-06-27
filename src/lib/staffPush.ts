import { API_BASE } from "@/lib/api";
import { getStoredStoreSlug } from "@/lib/storeSlug";
import { useAuthStore } from "@/store/authStore";

type StaffPushConfig = {
  enabled: boolean;
  publicKey: string | null;
};

type RegisterStaffPushOptions = {
  storeSlug?: string | null;
  requestPermission?: boolean;
};

const STAFF_PUSH_SW_URL = "/sw.js";

const normalizeSlug = (slug?: string | null) => {
  const value = (slug || "").trim();
  if (!value || value.toLowerCase() === "default-store") return undefined;
  return value;
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

const arrayBufferEquals = (left: ArrayBuffer | null, right: Uint8Array) => {
  if (!left || left.byteLength !== right.byteLength) return false;
  const leftView = new Uint8Array(left);
  return right.every((value, index) => leftView[index] === value);
};

const authHeaders = (storeSlug?: string | null) => {
  const token = useAuthStore.getState().token;
  const slug = normalizeSlug(storeSlug) || normalizeSlug(getStoredStoreSlug());
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(slug ? { "x-store-slug": slug } : {}),
  };
};

const fetchStaffPushConfig = async (storeSlug?: string | null) => {
  const response = await fetch(`${API_BASE}/staff/push/key`, {
    headers: authHeaders(storeSlug),
  });

  if (!response.ok) {
    throw new Error("Staff push notifications are not available.");
  }

  return (await response.json()) as StaffPushConfig;
};

export async function registerStaffPush({
  storeSlug,
  requestPermission = true,
}: RegisterStaffPushOptions = {}) {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window) ||
    !window.isSecureContext
  ) {
    return false;
  }

  try {
    let permission = window.Notification.permission;
    if (permission === "default" && requestPermission) {
      permission = await window.Notification.requestPermission();
    }
    if (permission !== "granted") {
      return false;
    }

    const config = await fetchStaffPushConfig(storeSlug);
    if (!config.enabled || !config.publicKey) {
      return false;
    }

    const applicationServerKey = urlBase64ToUint8Array(config.publicKey);
    const registration = await navigator.serviceWorker.register(STAFF_PUSH_SW_URL, {
      updateViaCache: "none",
    });
    await registration.update().catch(() => {});
    const readyRegistration = await navigator.serviceWorker.ready;
    const existingSubscription =
      await readyRegistration.pushManager.getSubscription();
    const existingKey = existingSubscription?.options?.applicationServerKey ?? null;
    if (
      existingSubscription &&
      !arrayBufferEquals(existingKey, applicationServerKey)
    ) {
      await existingSubscription.unsubscribe().catch(() => false);
    }
    const currentSubscription =
      await readyRegistration.pushManager.getSubscription();
    const subscription =
      currentSubscription ||
      (await readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      }));

    const response = await fetch(`${API_BASE}/staff/push/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(storeSlug),
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
      }),
    });

    if (!response.ok) {
      console.warn("Staff push subscription save failed", response.status);
    }
    return response.ok;
  } catch (error) {
    console.warn("Staff push registration failed", error);
    return false;
  }
}
