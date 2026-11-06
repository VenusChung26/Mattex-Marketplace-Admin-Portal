import { selectionKey } from "../lib/productSelection.js";
import { useSyncExternalStore } from "react";
import { subscribeStore, getStoreSnapshot } from "../lib/store";

export function useStore() {
  return useSyncExternalStore(subscribeStore, getStoreSnapshot, getStoreSnapshot);
}

const emptyCartLine = { qty: 0, intent: "" };
const cartLineCache = new Map();

function cartLineSnapshot(reference) {
  const id = String(reference || "");
  const draft = getStoreSnapshot().draft;
  const line = (draft?.lines || []).find((row) => selectionKey(row) === id && !row.custom) || null;
  const qty = line?.qty || 0;
  const intent = line?.intent || "";
  const prev = cartLineCache.get(id);
  if (prev && prev.qty === qty && prev.intent === intent) return prev;
  const next = qty || intent ? { qty, intent } : emptyCartLine;
  cartLineCache.set(id, next);
  return next;
}

export function useCartLine(productId, options = {}) {
  const id = selectionKey({ productId, ...options });
  return useSyncExternalStore(subscribeStore, () => cartLineSnapshot(id), () => cartLineSnapshot(id));
}
