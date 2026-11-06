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

test("相依選項顯示文字相同時，伺服器仍按正確上游規格保存及計價", async () => {
  const dependent={...product,specChoices:[],specGroups:[{id:"type",options:["A","B"]},{id:"size",dependsOn:"type",options:[
    {key:"100",label:"100mm",parent:"A",sku:"A-100",unit_price:100},
    {key:"100",label:"100mm",parent:"B",sku:"B-100",unit_price:150},
  ]}]};
  await writeFile("data/catalog-snapshot.json",JSON.stringify({products:[dependent]}));
  try {
    const result=await handleRfqPost({action:"po_create",buyer,project:"Site",delivery:{address:"HK",date:"N/A"},lines:[{productId:product.id,qty:2,pickedSpecs:{type:"B",size:"100"}}]},request);
    assert.equal(result.status,200);
    assert.equal(result.body.po.lines[0].sku,"B-100");
    assert.equal(result.body.po.total,300);
    assert.equal(result.body.po.lines[0].selectionSnapshot.product.specGroups[1].options[0].parent,"B");
  } finally { await writeFile("data/catalog-snapshot.json",JSON.stringify({products:[product]})); }
});

test("買家只修改數量時保留標準規格快照及訂製描述", async () => {
  const {createHmac}=await import("node:crypto");
  const {readFile}=await import("node:fs/promises");
  process.env.SESSION_SECRET="selection-test-session-secret-32-characters";
  const payload=Buffer.from(JSON.stringify({kind:"buyer",email:buyer.email,exp:Date.now()+60000})).toString("base64url");
  const signature=createHmac("sha256",process.env.SESSION_SECRET).update(payload).digest("base64url");
  const member=new Request("http://localhost/api/rfq",{headers:{cookie:`mm_buyer=${payload}.${signature}`}});
  const created=await handleRfqPost({action:"submit",lines:[line("80mm"),{productId:"custom_fixture",name:"Custom board",custom:true,qty:1,spec:"drawing"}]},member);
  assert.equal(created.status,200);
  const id=created.body.record.id;
  const reversed=await handleRfqPost({action:"rfq_decide",id,decision:"buyer_reverse"},member);
  assert.equal(reversed.status,200,JSON.stringify(reversed.body));
  const lines=created.body.record.lines.map((l,index)=>({...l,qty:3,...(index===1?{description:"Freeform dimensions",baseProductNo:"CUSTOM-BASE",image:"/custom.webp"}:{})}));
  const saved=await handleRfqPost({action:"rfq_buyer_content",id,content:{lines}},member);
  assert.equal(saved.status,200);
  const record=JSON.parse(await readFile(".local-rfq-store.json","utf8")).rfqs[id];
  assert.equal(record.lines[0].selectionSnapshot.product.productNo,"BOARD-80");
  assert.equal(record.lines[1].description,"Freeform dimensions");
  assert.equal(record.payload.lines[1].baseProductNo,"CUSTOM-BASE");
  assert.equal(record.lines[1].image,"/custom.webp");
  const resubmitted=await handleRfqPost({action:"rfq_buyer_content",id,resubmit:true,content:{lines}},member);
  assert.equal(resubmitted.status,200,JSON.stringify(resubmitted.body));
  const revised=JSON.parse(await readFile(".local-rfq-store.json","utf8")).rfqs[id];
  assert.equal(revised.payload.requestVersions[0].lines[0].qty,2);
  assert.equal(revised.payload.requestVersions[1].lines[0].qty,3);
  assert.equal(revised.payload.requestVersions[1].lines[0].selectionSnapshot.product.productNo,"BOARD-80");
  assert.equal(revised.payload.requestEffectiveVersion,2);
  assert.equal(resubmitted.body.patch.fields.requestEffectiveVersion,2);
});

test("所選規格沒有售價時不套用另一規格的售價建立採購單", async () => {
  await writeFile("data/catalog-snapshot.json",JSON.stringify({products:[{...product,specChoices:[{picks:{thickness:"80mm"},unit_price:null}]}]}));
  try {
    const result=await handleRfqPost({action:"po_create",buyer,project:"Site",delivery:{address:"HK",date:"N/A"},lines:[line("80mm")]},request);
    assert.equal(result.status,400);
    assert.equal(result.body.error,"no_price");
  } finally { await writeFile("data/catalog-snapshot.json",JSON.stringify({products:[product]})); }
});
