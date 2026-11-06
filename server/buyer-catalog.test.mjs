import test from "node:test";
import assert from "node:assert/strict";
import { toPublicCatalog } from "./public-catalog.js";

test("買家商品目錄在首次呈現時同樣合併規格、排除下架商品並保留分類圖片", () => {
  const category = "木材、夾板, Timber / Plywood";
  const source = {
    etag: "revision-1",
    categories: [{ name: category, image: "/timber.webp" }, { name: "Old category" }],
    products: [
      { id: "ply-a", productNo: "MKT-LIST-A", name: "White faced Plywood — 12mm", category, sizeDesc: "1220x2440 · 12mm · BB", listedPrice: true, unit_price: 100, internalNote: "staff" },
      { id: "ply-b", productNo: "MKT-LIST-B", name: "White faced Plywood — 18mm", category, sizeDesc: "1220x2440 · 18mm · BB", listedPrice: true, unit_price: 120 },
      { id: "hidden", name: "Hidden", category: "Old category", published: false },
    ],
  };
  const result = toPublicCatalog(source);
  assert.equal(result.products.length, 1);
  assert.deepEqual(result.products[0].specGroups.map((group) => group.id), ["ply-size", "ply-thickness", "ply-grade"]);
  assert.equal(result.products[0].internalNote, undefined);
  assert.deepEqual(result.categories, [{ name: category, image: "/timber.webp", imageFallback: "" }]);
  assert.deepEqual(toPublicCatalog(result), result, "already published snapshots keep the same choices and price");
  assert.equal(source.products.length, 3);
});
