const SESSION_KEY = "locality-session-id";

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
