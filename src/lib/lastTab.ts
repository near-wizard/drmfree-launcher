const STORAGE_KEY = "drmfree-launcher:last-tab";

export type Tab = "library" | "store" | "wishlist";

export function loadLastTab(): Tab {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "store" || raw === "wishlist" ? raw : "library";
  } catch {
    return "library";
  }
}

export function saveLastTab(tab: Tab): void {
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // Best-effort only — a full/unavailable localStorage shouldn't break tab switching.
  }
}
