const KEY = "bft-farepay-wallet";

export function getOrCreateWalletId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(KEY);
  if (existing && existing.length >= 32) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(KEY, id);
  return id;
}

export function shortWallet(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
