import { API_BASE } from "@/lib/api";
import { getStoredStoreSlug } from "@/lib/storeSlug";

type CustomerPushConfig = {
  enabled: boolean;
  publicKey: string | null;
};

type RegisterCustomerPushOptions = {
  tableId: string;
  orderId?: string | null;
  storeSlug?: string | null;
  requestPermission?: boolean;
};

const CUSTOMER_PUSH_SW_URL = "/sw.js";

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

const fetchCustomerPushConfig = async (storeSlug?: string | null) => {
  const slug = normalizeSlug(storeSlug) || normalizeSlug(getStoredStoreSlug());
  const response = await fetch(`${API_BASE}/public/push/key`, {
    headers: slug ? { "x-store-slug": slug } : undefined,
  });

  if (!response.ok) {
    throw new Error("Push notifications are not available.");
  }

  return (await response.json()) as CustomerPushConfig;
};

export async function registerCustomerPushForOrder({
  tableId,
  orderId,
  storeSlug,
  requestPermission = true,
}: RegisterCustomerPushOptions) {
  if (
    typeof window === "undefined" ||
    !tableId ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window) ||
    !window.isSecureContext
  ) {
    return false;
  }

  try {
    const config = await fetchCustomerPushConfig(storeSlug);
    if (!config.enabled || !config.publicKey) {
      return false;
    }

    let permission = window.Notification.permission;
    if (permission === "default" && requestPermission) {
      permission = await window.Notification.requestPermission();
    }
    if (permission !== "granted") {
      return false;
    }

    const registration = await navigator.serviceWorker.register(
      CUSTOMER_PUSH_SW_URL
    );
    const existingSubscription =
      await registration.pushManager.getSubscription();
    const subscription =
      existingSubscription ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      }));
    const slug = normalizeSlug(storeSlug) || normalizeSlug(getStoredStoreSlug());

    const response = await fetch(`${API_BASE}/public/push/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(slug ? { "x-store-slug": slug } : {}),
      },
      body: JSON.stringify({
        tableId,
        orderId: orderId || null,
        subscription: subscription.toJSON(),
      }),
    });

    return response.ok;
  } catch (error) {
    console.warn("Customer push registration failed", error);
    return false;
  }
}
