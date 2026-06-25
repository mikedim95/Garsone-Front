const KEY = "STORE_SLUG";

const canUseStorage = () => typeof window !== "undefined";

const safeGet = (storage: Storage | undefined) => {
  try {
    const value = storage?.getItem(KEY);
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
};

export function getStoredStoreSlug(): string | null {
  if (!canUseStorage()) return null;
  // Per-tab session wins to avoid cross-tab/store bleed.
  const sessionValue = safeGet(window.sessionStorage);
  if (sessionValue) return sessionValue;
  return safeGet(window.localStorage);
}

export function setStoredStoreSlug(slug: string | null | undefined) {
  if (!canUseStorage()) return;
  try {
    if (slug && slug.trim()) {
      window.sessionStorage.setItem(KEY, slug.trim());
    } else {
      window.sessionStorage.removeItem(KEY);
    }
  } catch {}
  // Clear legacy localStorage usage to avoid cross-store collisions.
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}

export function clearStoredStoreSlug() {
  setStoredStoreSlug(null);
}

export function formatStoreSlugLabel(slug: string | null | undefined) {
  const normalized = (slug || "").trim();
  if (!normalized) return "";
  return normalized
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveStoreDisplayName(
  storedName: string | null | undefined,
  storeSlug: string | null | undefined,
  fallback: string
) {
  const name = (storedName || "").trim();
  const slugLabel = formatStoreSlugLabel(storeSlug);
  // Offline demo names are local-only placeholders and should not win over an authenticated store.
  const isOfflinePlaceholder = /\boffline\b|\bdemo\b/i.test(name);
  if (name && !(storeSlug && isOfflinePlaceholder)) return name;
  return slugLabel || fallback;
}
