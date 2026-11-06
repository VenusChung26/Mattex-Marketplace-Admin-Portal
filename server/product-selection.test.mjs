import test from "node:test";
import assert from "node:assert/strict";
import "../src/lib/ssrNodePolyfill.js";
const store = await import("../src/lib/store.js");

const product = {
  id: "selection-board", name: "Board", category: "Boards", productNo: "BOARD", moq: 1,
  specGroups: [{ id: "thickness", label: "厚度", options: ["80mm", "100mm"] }],
};

test("不同商品選擇分行，登入前草稿刷新後仍保存各自規格及數量", async () => {
  localStorage.clear();
  await store.seedCatalogSnapshot({ products: [product] });
  store.addToCart(product.id, { silentInvite: true, qty: 2, pickedSpecs: { thickness: "80mm" }, intent: "quote" });
  store.addToCart(product.id, { silentInvite: true, qty: 3, pickedSpecs: { thickness: "100mm" }, intent: "quote" });
  await store.seedCatalogSnapshot({ products: [{ ...product, image: "/updated.webp" }] });
  assert.deepEqual(store.getDraft().lines.map((line) => [line.pickedSpecs.thickness, line.qty]), [["80mm", 2], ["100mm", 3]]);
  const [first, second] = store.getDraft().lines;
  assert.notEqual(first.lineId, second.lineId);
  store.setLineQty(first.lineId, 4);
  assert.deepEqual(store.getDraft().lines.map((line) => line.qty), [4, 3]);
  store.removeLine(first.lineId);
  assert.equal(store.getDraft().lines[0].pickedSpecs.thickness, "100mm");
});

test("同一商品選擇可累加，最低購買量提高後不自動增購", async () => {
  localStorage.clear();
  await store.seedCatalogSnapshot({ products: [product] });
  store.addToCart(product.id, { silentInvite: true, qty: 2, pickedSpecs: { thickness: "80mm" } });
  store.addToCart(product.id, { silentInvite: true, qty: 3, pickedSpecs: { thickness: "80mm" } });
  assert.equal(store.getDraft().lines[0].qty, 5);
  await store.seedCatalogSnapshot({ products: [{ ...product, moq: 20 }] });
  const line = store.draftTotals(store.getDraft()).lines[0];
  assert.equal(line.qty, 5);
  assert.equal(line.selectionIssue, "moq");
  store.setLineQty(line.lineId, 20);
  assert.equal(store.draftTotals(store.getDraft()).lines[0].selectionIssue, "");
});

test("文件使用已保存的選擇標籤，不被最新商品目錄重新解讀", async () => {
  localStorage.clear();
  await store.seedCatalogSnapshot({ products: [product] });
  store.addToCart(product.id, { silentInvite: true, qty: 2, pickedSpecs: { thickness: "80mm" } });
  const saved = { ...store.getDraft().lines[0], name: "Board", productNo: "BOARD", unit: "pc" };
  await store.seedCatalogSnapshot({ products: [{ ...product, specGroups: [{ id: "thickness", label: "新厚度", options: [{ key: "80mm", label: "Changed label" }] }] }] });
  const item = store.quotePdfItems([saved])[0];
  assert.ok(item.infoRows.some((row) => row.value === "80mm"));
  assert.ok(!item.infoRows.some((row) => row.value === "Changed label"));
});

test("核對失敗時保留草稿，買家可以重試而不建立未核對的詢價", async (t) => {
  localStorage.clear();
  await store.seedCatalogSnapshot({ products: [product] });
  store.addToCart(product.id, { silentInvite: true, qty: 2, pickedSpecs: { thickness: "80mm" }, intent: "quote" });
  const before = structuredClone(store.getDraft());
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(init.body).action);
    throw new Error("offline");
  });
  const guest = { name: "Buyer", companyName: "Company", email: "buyer@example.test", phone: "12345678", address: "HK", project: "Site", deliveryDate: "N/A" };
  const result = await store.submitRfq(before.lines.map((l) => l.lineId), { kind: "quote", allowGuest: true, guest, skipLogistics: true });
  assert.equal(result.error, "catalog_unavailable");
  assert.deepEqual(store.getDraft(), before);
  assert.deepEqual(requests, ["validate_selections"]);
});

test("已選規格消失時草稿保留原需求，標示失效而非代選另一規格", async () => {
  localStorage.clear();
  await store.seedCatalogSnapshot({ products: [product] });
  store.addToCart(product.id, { silentInvite: true, qty: 10, pickedSpecs: { thickness: "80mm" } });
  await store.seedCatalogSnapshot({ products: [{ ...product, moq: 20, specGroups: [{ ...product.specGroups[0], options: ["100mm"] }] }] });
  const draft = store.getDraft();
  const line = store.draftTotals(draft).lines[0];
  assert.equal(line.pickedSpecs.thickness, "80mm");
  assert.equal(line.qty, 10);
  assert.equal(line.selectionIssue, "selection_invalid");
});

test("訪客登入後仍保留同款商品的兩個選擇", async (t) => {
  localStorage.clear();
  await store.seedCatalogSnapshot({ products: [product] });
  store.addToCart(product.id, { silentInvite: true, qty: 2, pickedSpecs: { thickness: "80mm" } });
  store.addToCart(product.id, { silentInvite: true, qty: 3, pickedSpecs: { thickness: "100mm" } });
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ok:true,account:{email:"selection-buyer@example.test",name:"Buyer",approvalStatus:"approved"}}), {status:200,headers:{"content-type":"application/json"}}));
  const result = await store.loginUser({email:"selection-buyer@example.test",password:"fixture"});
  assert.equal(result.ok, true);
  assert.deepEqual(store.getDraft().lines.map((line) => [line.pickedSpecs.thickness,line.qty]), [["80mm",2],["100mm",3]]);
});

test("重選成已有規格時只合併相同選擇，保留買家確認的總數量", async () => {
  localStorage.clear();
  await store.seedCatalogSnapshot({products:[product]});
  store.addToCart(product.id,{silentInvite:true,qty:2,pickedSpecs:{thickness:"80mm"}});
  store.addToCart(product.id,{silentInvite:true,qty:3,pickedSpecs:{thickness:"100mm"}});
  const ref=store.getDraft().lines[0].lineId;
  assert.equal(store.replaceDraftSelection(ref,product.id,{qty:2,pickedSpecs:{thickness:"100mm"}}).ok,true);
  assert.equal(store.getDraft().lines.length,1);
  assert.equal(store.getDraft().lines[0].qty,5);
  assert.equal(store.getDraft().lines[0].lineId,ref);
});
