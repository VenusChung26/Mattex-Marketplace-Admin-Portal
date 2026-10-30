import { useEffect, useState } from "react";
import { getCatalogEpoch, searchProducts, subscribeStore } from "./store";
import { assignProducts, buildAutoGroups, collapseCatalog, indexGroups, releaseProducts } from "./catalogGroup";
import { getCatalogGroups as loadRemoteCatalogGroups, saveCatalogGroups as saveCatalogGroupsRemote } from "./remote.js";

export { collapseCatalog };

let groups = [];
let byProduct = new Map();
let source = "auto";
let remoteLoad = null;
let autoKey = null;
let savedKey = null;
let catalogWatch = null;
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

function skuKey(value) {
  return String(value || "").trim().toUpperCase();
}

/** Saved groups still point at the old mkt-* ids. Live catalog ids are UUIDs, matched here by SKU. */
function rebindSavedGroups(list) {
  const products = searchProducts("");
  if (!products.length || !Array.isArray(list) || !list.length) return list;
  const bySku = new Map();
  const liveIds = new Set();
  for (const product of products) {
    const id = String(product.id || "");
    if (id) liveIds.add(id);
    const sku = skuKey(product.productNo);
    if (sku && !bySku.has(sku)) bySku.set(sku, id);
  }
  let changed = false;
  const next = [];
  const used = new Set();
  for (const group of list) {
    const members = [];
    for (const member of group.members || []) {
      const sku = skuKey(member.productNo);
      const fromSku = sku ? bySku.get(sku) : "";
      const current = String(member.productId || "");
      const productId = fromSku || (liveIds.has(current) ? current : "");
      if (productId && used.has(productId)) continue;
      if (productId) used.add(productId);
      const nextId = productId || current;
      if (nextId !== current) changed = true;
      members.push({ ...member, productId: nextId });
    }
    if (members.length) next.push({ ...group, members });
  }
  return changed ? next : list;
}

function ensureAutoGroups(epoch) {
  if (source === "saved") {
    if (savedKey === epoch) return;
    const next = rebindSavedGroups(groups);
    if (next === groups && !searchProducts("").length) return;
    savedKey = epoch;
    if (next !== groups) publish(next, "saved");
    return;
  }
  if (autoKey === epoch) return;
  autoKey = epoch;
  publish(buildAutoGroups(searchProducts("")), "auto");
}

function watchCatalogEpoch() {
  if (catalogWatch) return;
  ensureAutoGroups(getCatalogEpoch());
  catalogWatch = subscribeStore(() => ensureAutoGroups(getCatalogEpoch()));
}

function publish(next, nextSource) {
  const bound = nextSource === "saved" ? rebindSavedGroups(next) : next;
  groups = Array.isArray(bound) ? bound : [];
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
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    watchCatalogEpoch();
    const onChange = () => setEpoch((value) => value + 1);
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, []);

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
