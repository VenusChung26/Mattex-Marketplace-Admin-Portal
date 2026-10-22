function finiteNumber(value) {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function stripTicks(value) {
  return String(value || "").replace(/^`+|`+$/g, "").trim();
}

/** Official product card price: ProductDto.unit_price only. Our catalog `price` is a different field. */
export function sellingAmount(product) {
  return finiteNumber(product?.unit_price);
}

function requestPriceLabel(lang) {
  if (lang === "zh" || lang === "en") return lang === "zh" ? "價格待定" : "Price Upon Request";
  try {
    return localStorage.getItem("subbie_lang") === "zh" ? "價格待定" : "Price Upon Request";
  } catch {
    return "Price Upon Request";
  }
}

/** Zip fmtMoney, and their product.priceUponRequest copy when there is no positive unit_price. */
export function formatUnitPrice(amount, lang) {
  const n = finiteNumber(amount);
  if (n == null || n <= 0) return requestPriceLabel(lang);
  return (
    "HKD $" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

const ZH_UNIT = {
  bag: "袋",
  bags: "袋",
  sheet: "張",
  sheets: "張",
  pail: "桶",
  pails: "桶",
  pc: "件",
  pcs: "件",
  piece: "件",
  pieces: "件",
  set: "套",
  sets: "套",
  lot: "批",
  lots: "批",
  license: "許可",
  no: "個",
  "no.": "個",
};

const LEAD_TIME_ZH = {
  "3–4 working days, subject to ex-stock": "視現貨而定，約 3–4 個工作天",
  "3-4 working days, subject to ex-stock": "視現貨而定，約 3–4 個工作天",
  "4-6 weeks": "4–6 星期",
  "7-15 days, can be expedited": "7–15 日，可加急",
  "3-7 days to site": "3–7 日到工地",
  "15 days, can be expedited": "15 日，可加急",
  "3-5 days to Shenzhen": "3–5 日到深圳",
  "7 days to HK": "7 日到香港",
  "20 days": "20 日",
  "Normally 5 days to Hongkong": "一般 5 日到香港",
  "Around 7 days to Hongkong": "約 7 日到香港",
  "As customer's requirement": "按客戶要求",
  "14 days, Urgent service available": "14 日，可加急",
  "Logistics to the site 2-3 days": "送到工地 2–3 日",
  "1-2 days fastest to the site": "最快 1–2 日到工地",
  "1-2 days fastest to the site  (Hong Kong Stock)": "香港現貨，最快 1–2 日到工地",
  "Foshan or to site": "佛山出貨，或送到工地",
  "7-14 days, FOB to Shenzhen": "7–14 日，深圳 FOB",
  "25 – 35 working days EXW or to Hongkong": "出廠或到香港 25–35 個工作天",
  "40 days After advance payment. Expedited service is available.": "預付款後 40 日，可加急",
  "FOB for Ningbo & Shanghai; Or CIF for Port of Hong Kong": "寧波及上海 FOB，或香港港 CIF",
  "EXW in Shenzhen , Transport to Hong Kong to be separate": "深圳出廠，運到香港另計",
  "Self-pickup within the factory, loading assistance, excluding unloading (excluding freight); Delivery at the project site, including unloading (including freight)":
    "工廠自取，協助裝貨，不包括卸貨（不包括運費）；送到工地並包括卸貨（包括運費）",
};

/** Buyer-facing lead time. Stored text stays English. */
export function localizeLeadTime(text, lang) {
  const raw = String(text || "").trim();
  if (!raw || lang !== "zh") return raw;
  if (LEAD_TIME_ZH[raw]) return LEAD_TIME_ZH[raw];
  const range = raw.match(/^(\d+)\s*[–-]\s*(\d+)\s*days$/i);
  if (range) return `${range[1]}–${range[2]} 日`;
  const one = raw.match(/^(\d+)\s*days$/i);
  if (one) return `${one[1]} 日`;
  return raw;
}

function localizePacking(value) {
  return String(value || "")
    .replace(/(\d+(?:\.\d+)?)\s*kg\s*\/\s*bag/gi, "$1 公斤／袋")
    .replace(/(\d+(?:\.\d+)?)\s*kg\s*\/\s*pail/gi, "$1 公斤／桶");
}

const SPEC_LABEL = {
  en: { size: "Size", packing: "Packing", lead: "Delivery" },
  zh: { size: "尺寸", packing: "包裝", lead: "送貨" },
};

/** Split a spec into the same left title and right content used by the product facts. */
export function specParts(text, lang) {
  const raw = String(text || "").trim();
  const labeled = raw.match(/^(size|packing|lead)\s*:\s*(.+)$/i);
  const locale = lang === "zh" ? "zh" : "en";
  if (labeled) {
    const key = labeled[1].toLowerCase();
    let value = labeled[2].trim();
    if (locale === "zh" && key === "packing") value = localizePacking(value);
    if (key === "lead") value = localizeLeadTime(value, locale);
    return { label: SPEC_LABEL[locale][key], value };
  }
  const cover = raw.match(/^~?\s*([\d.]+)\s*kg\/m²\/mm thick$/i);
  if (cover && locale === "zh") return { label: "", value: `用量約 ${cover[1]} 公斤／平方米／毫米厚` };
  return { label: "", value: raw };
}

/** Buyer-facing specification line. */
export function localizeSpecLine(text, lang) {
  const parts = specParts(text, lang);
  if (!parts.label) return parts.value;
  return lang === "zh" ? `${parts.label}：${parts.value}` : `${parts.label}: ${parts.value}`;
}

const HAN = /[\u4e00-\u9fff]/;

/** Buyer purpose chips. Chinese pages keep Chinese tags when the product has any. */
export function buyerPurposes(product, lang) {
  const terms = (Array.isArray(product?.purposes) ? product.purposes : [])
    .map((term) => String(term).trim())
    .filter((term) => term && !/^\d+\.\s/.test(term));
  if (lang === "zh" && terms.some((term) => HAN.test(term))) return terms.filter((term) => HAN.test(term));
  return terms;
}

/** Lead time already appears in the product facts, so the spec list omits it. */
export function isLeadSpec(text) {
  return /^lead\s*:/i.test(String(text || "").trim());
}

/** Sales unit in the current language. Stored values stay English. */
export function displayUnit(unit, lang) {
  const raw = String(unit || "").trim();
  if (!raw || lang !== "zh") return raw;
  return ZH_UNIT[raw.toLowerCase()] || raw;
}

/** Quantity at which delivery is lower. Missing or non-positive means no public line. */
export function lowerDeliveryQty(product) {
  const qty = finiteNumber(product?.lowerDeliveryQty);
  return qty != null && qty > 0 ? qty : null;
}

/** Official min_order_qty. Our catalog stores it as moq. */
export function orderMinimum(product) {
  const official = finiteNumber(product?.min_order_qty);
  if (official != null) return official;
  return finiteNumber(product?.moq);
}

/** Official is_tailor_made. Our catalog stores it as tailorMade. */
export function isTailorMade(product) {
  if (product?.is_tailor_made != null) return Boolean(product.is_tailor_made);
  return Boolean(product?.tailorMade);
}

/** Official files[0] signed URL, then our image. Backticks around a signed URL are stripped, matching their productImage. */
export function productImageUrl(product) {
  const file = Array.isArray(product?.files) ? product.files[0] : null;
  if (file) {
    const thumb = stripTicks(file.thumbnail_file_path);
    const signed = stripTicks(file.sign_url);
    if (thumb) return thumb;
    if (signed) return signed;
    if (file.file_path) return String(file.file_path);
  }
  return String(product?.image || product?.imageUrl || "");
}

/** Official sku display: keep an existing MKT- prefix, otherwise add one. Our productNo is that sku. */
export function displaySku(product) {
  const raw = String(product?.sku || product?.productNo || product?.provisionalSku || "").trim();
  if (!raw) return "";
  return /^MKT-/i.test(raw) ? raw.toUpperCase() : `MKT-${raw.toUpperCase()}`;
}
