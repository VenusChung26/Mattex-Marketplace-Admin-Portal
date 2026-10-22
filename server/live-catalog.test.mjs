import test from "node:test";
import assert from "node:assert/strict";
import { catalogToSeed } from "../src/lib/ssrCatalog.js";
import { staffPrimaryText, staffRemarkText, staffSizeText } from "../src/lib/editedProductText.js";

test("the shop page uses the saved catalog, not the file baked at deploy", () => {
  const file = { etag: "old", products: [{ id: "mkt-mesh-a142", name: "A142 — 鋼筋網, Reinforcement Mesh" }] };
  const live = { etag: "new", products: [{ id: "mkt-mesh-a142", name: "A142 — 鋼筋網, Reinforcement Mesh (2)" }] };
  assert.equal(catalogToSeed(live, file).products[0].name, live.products[0].name);
  assert.equal(catalogToSeed(null, file).products[0].name, file.products[0].name);
  assert.equal(catalogToSeed({ products: [] }, file).products[0].name, file.products[0].name);
});

test("portal size, spec, and remark stay visible when they differ from the old description", () => {
  const product = {
    description: "old description",
    sizeDesc: "500 × 500 × 80mm",
    primarySpec: "Density 1100kg/m³",
    remark: "Also known as mesh A",
  };
  assert.equal(staffSizeText(product), "500 × 500 × 80mm");
  assert.equal(staffPrimaryText(product), "Density 1100kg/m³");
  assert.equal(staffRemarkText(product), "Also known as mesh A");
  assert.equal(staffSizeText({ description: "same", sizeDesc: "same" }), "");
});
