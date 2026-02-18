const toBool = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
};

const isPrivateIpv4 = (hostname: string) => {
  const match = hostname.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  );
  if (!match) return false;

  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = octets;
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
};

const isLocalHost = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "::1" ||
  hostname === "[::1]" ||
  hostname.endsWith(".local") ||
  isPrivateIpv4(hostname);

export const isOfflineModeExplicitlyEnabled = () =>
  toBool(import.meta.env.VITE_ENABLE_OFFLINE_MODE);

export const isOfflineModeAllowed = () => {
  if (isOfflineModeExplicitlyEnabled()) return true;
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname.toLowerCase();
  return isLocalHost(hostname);
};

export const readOfflineStorageFlag = () => {
  if (!isOfflineModeAllowed() || typeof window === "undefined") return false;
  try {
    return toBool(window.localStorage?.getItem("OFFLINE"));
  } catch (error) {
    console.warn("Failed to read OFFLINE flag from localStorage", error);
    return false;
  }
};

export const writeOfflineStorageFlag = (enabled: boolean) => {
  if (!isOfflineModeAllowed() || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem("OFFLINE", enabled ? "1" : "0");
    return true;
  } catch (error) {
    console.warn("Failed to persist OFFLINE flag", error);
    return false;
  }
};

export const isOfflineModeEnabled = () => {
  if (!isOfflineModeAllowed()) return false;
  const envFlag = toBool(import.meta.env.VITE_OFFLINE);
  return envFlag || readOfflineStorageFlag();
};
