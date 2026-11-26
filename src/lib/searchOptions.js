import { foldHan } from "./han.js";
import { bestSpecMatch } from "./specSearch.js";
import { CATEGORY_LIST_PAUSED } from "./categoryPause.js";
import { productShopCategoryIds, shopCategoryById, shopCategoryRows } from "./categoryTree.js";

export function productSku(product) {
  return String(product?.productNo || product?.provisionalSku || product?.id || "").trim();
}

export function categoriesInCatalog(catalog) {
  if (CATEGORY_LIST_PAUSED) return [];
  const categories = new Map();
  for (const product of catalog || []) {
    const category = String(product?.category || "").trim();
    if (!category) continue;
    categories.set(category, (categories.get(category) || 0) + 1);
  }
  return [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh"));
}

function shopTreeCategoryHits(catalog, query) {
  const tally = new Map();
  const parentProducts = new Map();
  for (const product of catalog || []) {
    const parents = new Set();
    for (const id of productShopCategoryIds(product)) {
      tally.set(id, (tally.get(id) || 0) + 1);
      const node = shopCategoryById(id);
      if (node) parents.add(node.parentId || node.id);
    }
    for (const parentId of parents) {
      if (!parentProducts.has(parentId)) parentProducts.set(parentId, new Set());
      parentProducts.get(parentId).add(product.id || product.productNo);
    }
  }
  const hits = [];
  for (const row of shopCategoryRows()) {
    const name = String(row.name || "").trim();
    if (!name || !foldHan(name).toLowerCase().includes(query)) continue;
    const count = row.parentId ? tally.get(row.id) || 0 : parentProducts.get(row.id)?.size || tally.get(row.id) || 0;
    hits.push([name, count]);
  }
  return hits;
}

export function searchSuggestOptions(catalog, query, { excludeIds = [], wordLimit = 8, categoryLimit = 6, productLimit = 8, includeShopTree = false } = {}) {
  const q = foldHan(String(query || "").trim()).toLowerCase();
  if (!q) return { words: [], categories: [], products: [] };
  const skip = new Set(excludeIds);
  const available = (catalog || []).filter((product) => product && !skip.has(product.id));
  const words = new Map();
  const categories = new Map();
  for (const product of available) {
    const category = CATEGORY_LIST_PAUSED ? "" : String(product.category || "").trim();
    const categoryFold = foldHan(category).toLowerCase();
    if (category && categoryFold.includes(q)) {
      categories.set(category, (categories.get(category) || 0) + 1);
    }
    const seen = new Set();
    const bits = `${product.name || ""} ${category}`.split(/[^\p{L}\p{N}]+/u).filter((bit) => bit.length >= 2);
    for (const bit of bits) {
      const lower = foldHan(bit).toLowerCase();
      if (seen.has(lower) || !lower.startsWith(q) || lower === q) continue;
      seen.add(lower);
      const current = words.get(lower) || { label: bit, count: 0 };
      current.count += 1;
      words.set(lower, current);
    }
  }
  if (includeShopTree) {
    for (const [name, count] of shopTreeCategoryHits(available, q)) {
      categories.set(name, Math.max(categories.get(name) || 0, count));
    }
  }
  const products = available
    .map((product) => {
      const named = foldHan(`${product.name || ""} ${productSku(product)} ${CATEGORY_LIST_PAUSED ? "" : product.category || ""}`).toLowerCase().includes(q);
      const match = bestSpecMatch(product, q);
      if (!named && !match) return null;
      if (!named && match?.label) return { ...product, matchLabel: match.label };
      return product;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const rank = (product) => (foldHan(product.name || "").toLowerCase().startsWith(q) ? 0 : product.matchLabel ? 1 : 2);
      return rank(a) - rank(b) || String(a.name || "").localeCompare(String(b.name || ""));
    })
    .slice(0, productLimit);
  return {
    words: [...words.values()]
      .sort((a, b) => Number(/\d/.test(a.label)) - Number(/\d/.test(b.label)) || b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, wordLimit)
      .map((word) => word.label),
    categories: [...categories.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, categoryLimit),
    products,
  };
}

export function flattenSuggestOptions(options) {
  const items = [];
  for (const word of options?.words || []) items.push({ type: "word", id: `word:${word}`, label: word });
  for (const [name, count] of options?.categories || []) items.push({ type: "category", id: `cat:${name}`, label: name, count });
  for (const product of options?.products || []) {
    items.push({ type: "product", id: `product:${product.id}`, label: product.name, product });
  }
  return items;
}
