import { useSyncExternalStore } from "react";
import { subscribeStore, getStoreSnapshot } from "../lib/store";

export function useStore() {
  return useSyncExternalStore(subscribeStore, getStoreSnapshot, getStoreSnapshot);
}
