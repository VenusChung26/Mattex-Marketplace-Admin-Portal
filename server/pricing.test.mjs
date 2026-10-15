import test from "node:test";
import assert from "node:assert/strict";
import { priceOrderLines, unitPriceFor } from "./pricing.js";

const now = new Date("2026-10-14T10:00:00");
const products = [
  { id: "a", productNo: "MKT-A", name: "A", unit: "sheet", unit_price: 100, moq: 10 },
  { id: "b", productNo: "MKT-B", name: "B", unit: "pc" },
  { id: "c", productNo: "MKT-C", name: "C", unit_price: 50, deleted: true },
  { id: "d", productNo: "MKT-D", name: "D", unit_price: 50, discontinued: true },
  { id: "e", productNo: "MKT-E", name: "E", unit_price: 0 },
];
const promo = { banners: [{ id: "x", products: [{ productId: "a", price: 80, endsOn: "2026-10-31" }] }] };
const endedPromo = { banners: [{ id: "x", products: [{ productId: "a", price: 80, endsOn: "2026-10-01" }] }] };

test("a running offer beats unit_price; an ended offer does not", () => {
  assert.equal(unitPriceFor(products[0], promo, now), 80);
  assert.equal(unitPriceFor(products[0], endedPromo, now), 100);
});

test("prices come from the server, totals are rounded", () => {
  const out = priceOrderLines([{ productId: "a", qty: 10, unitPrice: 1 }], { products, promo: endedPromo, now });
  assert.equal(out.ok, true);
  assert.equal(out.lines[0].unitPrice, 100);
  assert.equal(out.total, 1000);
  assert.equal(out.lines[0].sku, "MKT-A");
});

test("refuses unpriced, zero price, deleted, discontinued, unknown, duplicate, below moq, bad qty", () => {
  const err = (rows) => priceOrderLines(rows, { products, promo: endedPromo, now }).error;
  assert.equal(err([{ productId: "b", qty: 1 }]), "no_price");
  assert.equal(err([{ productId: "e", qty: 1 }]), "no_price");
  assert.equal(err([{ productId: "c", qty: 1 }]), "unavailable");
  assert.equal(err([{ productId: "d", qty: 1 }]), "unavailable");
  assert.equal(err([{ productId: "zz", qty: 1 }]), "unknown");
  assert.equal(err([{ productId: "a", qty: 10 }, { productId: "a", qty: 10 }]), "unknown");
  assert.equal(err([{ productId: "a", qty: 5 }]), "moq");
  assert.equal(err([{ productId: "a", qty: 0 }]), "qty");
  assert.equal(err([{ productId: "a", qty: 1.5 }]), "qty");
  assert.equal(err([]), "empty");
});
