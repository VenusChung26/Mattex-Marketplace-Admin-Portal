import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const previousCwd = process.cwd();
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => Response.json({ id: "test-mail" });
const dir = await mkdtemp(path.join(tmpdir(), "subbie-selection-submit-"));
process.chdir(dir);
await mkdir("data");
const product = { id: "board-test", name: "Board test", category: "Board test", unit: "pc", moq: 1, listedPrice: true, unit_price: 100,
  specGroups: [{ id: "thickness", label: "厚度", options: ["80mm", "100mm"] }],
  specChoices: [
    { picks: { thickness: "80mm" }, sku: "BOARD-80", unit_price: 100 },
    { picks: { thickness: "100mm" }, sku: "BOARD-100", unit_price: 150 },
  ] };
await writeFile("data/catalog-snapshot.json", JSON.stringify({ etag: "test", products: [product], categories: [] }));
for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RFQ_STORE", "VERCEL", "VERCEL_ENV"]) delete process.env[key];
const { handleRfqPost } = await import("../api/rfq.js");
test.after(async () => { globalThis.fetch = previousFetch; process.chdir(previousCwd); await rm(dir, { recursive: true, force: true }); });
const request = new Request("http://localhost/api/rfq");
const buyer = { email: "buyer@example.test", name: "Buyer", company: "Company", phone: "12345678" };
const line = (pick, qty = 2) => ({ productId: product.id, name: "Board", qty, pickedSpecs: { thickness: pick } });

test("伺服器拒絕不存在的商品選擇，而不是接受任意規格文字", async () => {
  const result = await handleRfqPost({ action: "submit", buyer, lines: [line("200mm")] }, request);
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "selection_invalid");
});

test("提交前重新讀取已變更的規格及最低購買量", async () => {
  await writeFile("data/catalog-snapshot.json", JSON.stringify({ products: [{ ...product, moq: 20,
    specGroups: [{ ...product.specGroups[0], options: ["100mm"] }] }] }));
  const invalid = await handleRfqPost({ action: "submit", buyer, lines: [line("80mm", 20)] }, request);
  assert.equal(invalid.body.error, "selection_invalid");
  const below = await handleRfqPost({ action: "submit", buyer, lines: [line("100mm", 10)] }, request);
  assert.equal(below.body.error, "moq");
  const confirmed = await handleRfqPost({ action: "submit", buyer, lines: [line("100mm", 20)] }, request);
  assert.equal(confirmed.status, 200);
  await writeFile("data/catalog-snapshot.json", JSON.stringify({ products: [product] }));
});

test("無法取得最新商品目錄時拒絕建立新記錄，恢復後可重新核對", async () => {
  await unlink("data/catalog-snapshot.json");
  const failed = await handleRfqPost({ action: "submit", buyer, lines: [line("80mm")] }, request);
  assert.equal(failed.status, 503);
  assert.equal(failed.body.error, "catalog_unavailable");
  await writeFile("data/catalog-snapshot.json", JSON.stringify({ products: [product] }));
  const retried = await handleRfqPost({ action: "validate_selections", lines: [line("80mm")] }, request);
  assert.equal(retried.body.ok, true);
});

test("詢價的兩個商品選擇保存各自數量及提交時的規格", async () => {
  const result = await handleRfqPost({ action: "submit", buyer, lines: [line("80mm"), line("100mm", 3)] }, request);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.record.lines.map((l) => [l.pickedSpecs.thickness, l.qty, l.sku]), [["80mm", 2, "BOARD-80"], ["100mm", 3, "BOARD-100"]]);
  assert.match(result.body.record.lines[0].spec, /80mm/);
  assert.equal(result.body.record.lines[0].selectionSnapshot.product.productNo, "BOARD-80");
});

test("採購單按不同商品選擇分行並以各規格售價計價", async () => {
  const result = await handleRfqPost({ action: "po_create", buyer, project: "Site", delivery: { address: "HK", date: "N/A" },
    lines: [line("80mm"), line("100mm", 3)] }, request);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.po.total, 650);
  assert.deepEqual(result.body.po.lines.map((l) => [l.sku, l.qty]), [["BOARD-80", 2], ["BOARD-100", 3]]);
});
