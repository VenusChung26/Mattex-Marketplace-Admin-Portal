import test from "node:test";
import assert from "node:assert/strict";
import { applyMarketList, toPublicCatalog } from "./public-catalog.js";

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
  const ply = result.products.find((product) => product.name === "白板夾板, FSC White Faced Plywood");
  assert.ok(ply);
  assert.deepEqual(ply.specGroups.map((group) => group.id), ["ply-size", "ply-thickness", "ply-grade", "ply-spec"]);
  assert.deepEqual(ply.specGroups.find((group) => group.id === "ply-grade").options, ["F2"]);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].internalNote, undefined);
  assert.deepEqual(result.categories, [{ name: category, image: "/timber.webp", imageFallback: "" }]);
  assert.deepEqual(toPublicCatalog(result), result, "already published snapshots keep the same choices and price");
  assert.equal(source.products.length, 3);
});

test("數位與科技服務收起原有 14 件，改顯示 6 件服務", () => {
  const old = Array.from({ length: 14 }, (_, index) => ({
    id: `old-sw-${index}`,
    productNo: `MKT-SW-OLD-${index}`,
    name: `Old service ${index}`,
    category: "Software",
    unit: "license",
    supplier: "Mattex",
    image: "/sw.webp",
  }));
  const result = applyMarketList([...old, { id: "mesh", name: "網", category: "網, Mesh" }]);
  const digital = result.filter((product) => product.category === "數位與科技服務, Digital & Technology Services");
  assert.deepEqual(digital.map((product) => product.name), [
    "電子採購 (TMM), eProcurement (TMM)",
    "數位工程監督系統 (DWSS), Digital Works Supervision System (DWSS)",
    "智能文件管理 (SDM), Smart Document Management (SDM)",
    "補償事件工具, Compensation Event Tool",
    "付款方案, Payment Solution",
    "智能工地安全系統 (4S), Smart Site Safety System (4S)",
  ]);
  assert.equal(result.some((product) => String(product.id).startsWith("old-sw-")), false);
  assert.equal(result.some((product) => product.id === "mesh"), true);
});
