import { useCallback, useEffect, useRef, useState } from "react";
import { listPurchaseOrders } from "../lib/remote";

const BASE_MS = 4_000;
const MAX_MS = 120_000;

/**
 * Purchase orders from the server, display only. Refreshes every 4 s while the tab is visible,
 * straight away when the tab comes back, and backs off (up to 2 min) while the server keeps failing.
 * `enabled` false pauses everything (for example when nobody is signed in).
 */
export function usePurchaseOrders(enabled = true) {
  const [records, setRecords] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [updatedAt, setUpdatedAt] = useState(0);
  const failures = useRef(0);
  const timer = useRef(null);
  const alive = useRef(true);

  const stamp = useRef("");
  const load = useCallback(async () => {
    const result = await listPurchaseOrders();
    if (!alive.current) return;
    if (result.ok) {
      failures.current = 0;
      const next = JSON.stringify(result.records || []);
      if (next !== stamp.current) {
        stamp.current = next;
        setRecords(result.records);
        setUpdatedAt(Date.now());
      }
      setState((prev) => (prev === "ready" ? prev : "ready"));
    } else {
      failures.current += 1;
      setState((prev) => (prev === "error" ? prev : "error"));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return undefined;
    function schedule() {
      clearTimeout(timer.current);
      const wait = Math.min(MAX_MS, BASE_MS * 2 ** Math.min(failures.current, 3));
      timer.current = setTimeout(async () => {
        if (!document.hidden) await load();
        if (alive.current) schedule();
      }, wait);
    }
    function onVisible() {
      if (!document.hidden) load();
    }
    load().then(() => alive.current && schedule());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, load]);

  const replace = useCallback((po) => {
    setRecords((rows) => rows.map((row) => (row.id === po.id ? po : row)));
  }, []);

  return { records, state, updatedAt, refresh: load, replace };
}
