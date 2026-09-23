async function blobToBase64(blob) {
  if (!blob) return "";
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function tmsLines(rows) {
  return (Array.isArray(rows) ? rows : []).map((line) => ({
    name: line.name,
    productNo: line.productNo || "",
    qty: line.qty,
    unit: line.unit || "",
    description: line.description || "",
    requestedUnitPrice: line.requestedUnitPrice != null ? line.requestedUnitPrice : null,
    remark: line.remark || "",
    custom: Boolean(line.custom),
  }));
}

export async function submitRfqToTms({ kind, rfq, project, pdfBlob, pdfFilename, tmsEmail, tmsPassword, staffEmail }) {
  const pdfBase64 = await blobToBase64(pdfBlob);
  const res = await fetch("/api/tms-submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: kind === "buy" ? "buy" : "quote",
      tmsEmail: tmsEmail || "",
      tmsPassword: tmsPassword || "",
      staffEmail: staffEmail || "",
      rfq: {
        id: rfq?.id || "",
        project: project || rfq?.project || "",
        note: rfq?.note || "",
        responseDate: rfq?.responseDate || "",
        deliveryDate: rfq?.deliveryDate || "",
        address: rfq?.address || "",
        buyerEmail: rfq?.buyerEmail || "",
        buyerName: rfq?.buyerName || "",
      },
      lines: tmsLines(rfq?.lines),
      pdfBase64,
      pdfFilename,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "TMS submit failed");
  }
  return data;
}
