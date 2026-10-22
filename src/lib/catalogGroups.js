import { useEffect, useState } from "react";
import { useStore } from "../hooks/useStore";
import { searchProducts } from "./store";
import { assignProducts, buildAutoGroups, collapseCatalog, indexGroups, releaseProducts } from "./catalogGroup";
import { getCatalogGroups as loadRemoteCatalogGroups, saveCatalogGroups as saveCatalogGroupsRemote } from "./remote.js";

export { collapseCatalog };

let groups = [];
let byProduct = new Map();
let source = "auto";
let remoteLoad = null;
let autoKey = null;
const listeners = new Set();

function loadGroupsOnce() {
  if (source === "saved") return Promise.resolve(groups);
  if (!remoteLoad) {
    remoteLoad = loadRemoteCatalogGroups()
      .then((data) => {
        if (Array.isArray(data?.groups)) publish(data.groups, "saved");
        return groups;
      })
      .catch(() => {
        remoteLoad = null;
        return groups;
      });
  }
  return remoteLoad;
}

function ensureAutoGroups(epoch) {
  if (source === "saved" || autoKey === epoch) return;
  autoKey = epoch;
  publish(buildAutoGroups(searchProducts("")), "auto");
}

function publish(next, nextSource) {
  groups = Array.isArray(next) ? next : [];
  byProduct = indexGroups(groups);
  source = nextSource;
  listeners.forEach((fn) => fn());
}

export function getCatalogGroups() {
  return groups;
}

export function groupOf(productId) {
  return byProduct.get(String(productId || "")) || null;
}

export function catalogGroupIndex() {
  return byProduct;
}

export function useCatalogGroups() {
  const { catalogEpoch } = useStore();
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const onChange = () => setEpoch((value) => value + 1);
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, []);

  useEffect(() => {
    ensureAutoGroups(catalogEpoch);
  }, [catalogEpoch]);

  useEffect(() => {
    let cancel = false;
    loadGroupsOnce().then(() => {
      if (!cancel) setEpoch((value) => value + 1);
    });
    return () => {
      cancel = true;
    };
  }, []);

  return epoch;
}

export async function saveCatalogGroups(next) {
  const response = await saveCatalogGroupsRemote(next);
  const data = response.data || { ok: false, error: "Unable to save groups" };
  if (!response.res.ok || data?.ok === false) return { ok: false, error: data?.error || "Unable to save groups" };
  publish(data.groups || next, "saved");
  return { ok: true, groups: data.groups || next };
}

export function groupSelectedProducts(products) {
  return assignProducts(groups, products);
}

export function releaseSelectedProducts(productIds) {
  return releaseProducts(groups, productIds);
}
