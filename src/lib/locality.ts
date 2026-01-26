type LocalityApproval = {
  token: string;
  expiresAt: number;
  tableId: string;
  storeSlug?: string | null;
  purpose: "ORDER_SUBMIT";
  method: "nfc" | "qr" | "link";
  sessionId: string;
};

const APPROVAL_KEY = "locality-approval";
const SESSION_KEY = "locality-session-id";

const safeNow = () => Date.now();

const generateSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `loc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const getLocalitySessionId = (): string => {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = generateSessionId();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return generateSessionId();
  }
};

export const setStoredLocalityApproval = (approval: LocalityApproval) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(APPROVAL_KEY, JSON.stringify(approval));
  } catch {}
};

export const clearStoredLocalityApproval = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(APPROVAL_KEY);
  } catch {}
};

export const getStoredLocalityApproval = (opts: {
  tableId: string;
  storeSlug?: string | null;
  purpose: "ORDER_SUBMIT";
  sessionId: string;
}): LocalityApproval | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(APPROVAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalityApproval;
    if (!parsed?.token || !parsed?.expiresAt) {
      clearStoredLocalityApproval();
      return null;
    }
    if (parsed.expiresAt <= safeNow()) {
      clearStoredLocalityApproval();
      return null;
    }
    if (parsed.purpose !== opts.purpose) {
      clearStoredLocalityApproval();
      return null;
    }
    if (parsed.tableId !== opts.tableId) {
      clearStoredLocalityApproval();
      return null;
    }
    if (opts.storeSlug && parsed.storeSlug && parsed.storeSlug !== opts.storeSlug) {
      clearStoredLocalityApproval();
      return null;
    }
    if (parsed.sessionId !== opts.sessionId) {
      clearStoredLocalityApproval();
      return null;
    }
    return parsed;
  } catch {
    clearStoredLocalityApproval();
    return null;
  }
};

export const isNfcSupported = (): boolean => {
  if (typeof window === "undefined") return false;
  return "NDEFReader" in window;
};

export const getDeviceContext = () => {
  if (typeof navigator === "undefined") {
    return { platform: "unknown", deviceType: "unknown" };
  }
  const ua = navigator.userAgent || "";
  const platform =
    /android/i.test(ua)
      ? "android"
      : /iphone|ipad|ipod/i.test(ua)
      ? "ios"
      : "web";
  const deviceType =
    /ipad/i.test(ua)
      ? "tablet"
      : /mobile/i.test(ua)
      ? "mobile"
      : "desktop";
  return { platform, deviceType };
};

export type { LocalityApproval };
