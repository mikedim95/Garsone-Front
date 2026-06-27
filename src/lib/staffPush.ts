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
const SERVICE_WORKER_READY_TIMEOUT_MS = 3000;
const PUSH_SUBSCRIBE_TIMEOUT_MS = 10000;
let staffPushRegistrationPromise: Promise<boolean> | null = null;

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

const endpointHost = (subscription?: PushSubscription | null) => {
  if (!subscription?.endpoint) return null;
  try {
    return new URL(subscription.endpoint).host;
  } catch {
    return null;
  }
};

const postStaffPushDiagnostic = async (
  storeSlug: string | null | undefined,
  body: Record<string, unknown>
) => {
  try {
    await fetch(`${API_BASE}/staff/push/diagnostics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(storeSlug),
      },
      body: JSON.stringify({
        swUrl: STAFF_PUSH_SW_URL,
        permission:
          typeof window !== "undefined" && "Notification" in window
            ? window.Notification.permission
            : undefined,
        hasServiceWorker:
          typeof navigator !== "undefined" && "serviceWorker" in navigator,
        hasPushManager: typeof window !== "undefined" && "PushManager" in window,
        hasNotification:
          typeof window !== "undefined" && "Notification" in window,
        secureContext:
          typeof window !== "undefined" ? window.isSecureContext : undefined,
        ...body,
      }),
    });
  } catch {
    // Diagnostics must never break notification registration.
  }
};

const waitForReadyRegistration = async (
  registration: ServiceWorkerRegistration
) => {
  const ready = await Promise.race([
    navigator.serviceWorker.ready.then((readyRegistration) => ({
      registration: readyRegistration,
      timedOut: false,
    })),
    new Promise<{ registration: ServiceWorkerRegistration | null; timedOut: true }>(
      (resolve) =>
        window.setTimeout(
          () => resolve({ registration: null, timedOut: true }),
          SERVICE_WORKER_READY_TIMEOUT_MS
        )
    ),
  ]);

  return {
    registration: ready.registration ?? registration,
    timedOut: ready.timedOut,
  };
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
) =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      window.setTimeout(() => reject(new Error(message)), timeoutMs)
    ),
  ]);

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
  if (staffPushRegistrationPromise) {
    return staffPushRegistrationPromise;
  }
  staffPushRegistrationPromise = registerStaffPushInternal({
    storeSlug,
    requestPermission,
  }).finally(() => {
    staffPushRegistrationPromise = null;
  });
  return staffPushRegistrationPromise;
}

async function registerStaffPushInternal({
  storeSlug,
  requestPermission = true,
}: RegisterStaffPushOptions = {}) {
  await postStaffPushDiagnostic(storeSlug, { stage: "start", ok: true });

  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window) ||
    !window.isSecureContext
  ) {
    await postStaffPushDiagnostic(storeSlug, {
      stage: "unsupported",
      ok: false,
    });
    return false;
  }

  try {
    let permission = window.Notification.permission;
    if (permission === "default" && requestPermission) {
      permission = await window.Notification.requestPermission();
    }
    await postStaffPushDiagnostic(storeSlug, {
      stage: "permission",
      ok: permission === "granted",
      permission,
    });
    if (permission !== "granted") {
      return false;
    }

    const config = await fetchStaffPushConfig(storeSlug);
    await postStaffPushDiagnostic(storeSlug, {
      stage: "config",
      ok: Boolean(config.enabled && config.publicKey),
    });
    if (!config.enabled || !config.publicKey) {
      return false;
    }

    const applicationServerKey = urlBase64ToUint8Array(config.publicKey);
    const registration = await navigator.serviceWorker.register(STAFF_PUSH_SW_URL, {
      updateViaCache: "none",
    });
    await registration.update().catch(() => {});
    await postStaffPushDiagnostic(storeSlug, {
      stage: "sw-registered",
      ok: true,
      message: registration.active ? "active" : "not-active-yet",
    });
    const {
      registration: readyRegistration,
      timedOut: readyTimedOut,
    } = await waitForReadyRegistration(registration);
    if (readyTimedOut) {
      await postStaffPushDiagnostic(storeSlug, {
        stage: "sw-ready-timeout",
        ok: false,
        message: "Using returned service worker registration after timeout.",
      });
    }
    const existingSubscription =
      await readyRegistration.pushManager.getSubscription();
    await postStaffPushDiagnostic(storeSlug, {
      stage: "subscription-read",
      ok: true,
      hasSubscription: Boolean(existingSubscription),
      endpointHost: endpointHost(existingSubscription),
    });
    const existingKey = existingSubscription?.options?.applicationServerKey ?? null;
    if (
      existingSubscription &&
      !arrayBufferEquals(existingKey, applicationServerKey)
    ) {
      await existingSubscription.unsubscribe().catch(() => false);
      await postStaffPushDiagnostic(storeSlug, {
        stage: "subscription-reset",
        ok: true,
        message: "Existing subscription used a different applicationServerKey.",
      });
    }
    const currentSubscription =
      await readyRegistration.pushManager.getSubscription();
    if (!currentSubscription) {
      await postStaffPushDiagnostic(storeSlug, {
        stage: "subscribe-start",
        ok: true,
      });
    }
    const subscription =
      currentSubscription ||
      (await withTimeout(
        readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }),
        PUSH_SUBSCRIBE_TIMEOUT_MS,
        "Push subscription timed out."
      ));
    await postStaffPushDiagnostic(storeSlug, {
      stage: "subscribed",
      ok: true,
      hasSubscription: true,
      endpointHost: endpointHost(subscription),
    });

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

    await postStaffPushDiagnostic(storeSlug, {
      stage: "subscription-save",
      ok: response.ok,
      hasSubscription: true,
      endpointHost: endpointHost(subscription),
      message: `status:${response.status}`,
    });
    if (!response.ok) {
      console.warn("Staff push subscription save failed", response.status);
    }
    return response.ok;
  } catch (error) {
    await postStaffPushDiagnostic(storeSlug, {
      stage: "exception",
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
    console.warn("Staff push registration failed", error);
    return false;
  }
}
