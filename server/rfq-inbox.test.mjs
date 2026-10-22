import test from "node:test";
import assert from "node:assert/strict";
import { mergeInboxRecords } from "../api/rfq.js";

test("the sales inbox keeps new records and older rfqs rows", () => {
  const current = [{ id: "RFQ-26000001", lines: [{ productId: "new" }], buyerEmail: "a@mattex.com" }];
  const legacy = [
    { id: "RFQ-1297", lines: [{ productId: "old", name: "mesh" }], buyerEmail: "b@mattex.com", reviewStatus: "received" },
    { id: "RFQ-26000001", lines: [{ productId: "dup" }] },
    { name: "no id" },
  ];
  const rows = mergeInboxRecords(current, legacy);
  assert.deepEqual(rows.map((row) => row.id), ["RFQ-26000001", "RFQ-1297"]);
  assert.equal(rows[1].lines[0].name, "mesh");
  assert.equal(rows[1].reviewStatus, "received");
});
