const TMS_TX_LIST = "https://uat-tms-v2.mattex.com.hk/products/transacted-products";

const MATERIAL_TOKENS = [
  ["gypsum", "Gypsum"],
  ["xps", "XPS"],
  ["mesh", "Mesh"],
  ["foam", "Foam"],
  ["board", "Board"],
  ["net", "Net"],
  ["insulation", "Insulation"],
  ["brick", "Brick"],
  ["material", "Material"],
];

function firstToken(text) {
  const word = String(text || "")
    .trim()
    .split(/[^A-Za-z0-9.]+/)
    .find((w) => w.length >= 3);
  return word || "";
}

export function tmsDescriptionQuery(...parts) {
  const hay = parts.filter(Boolean).join(" ");
  const low = hay.toLowerCase();
  for (const [needle, token] of MATERIAL_TOKENS) {
    if (low.includes(needle)) return token;
  }
  return firstToken(hay);
}

export function tmsTransactedHref({ productCode = "", description = "" } = {}) {
  const q = new URLSearchParams({ current: "1", pageSize: "16" });
  const desc = tmsDescriptionQuery(description, productCode);
  if (desc) q.set("description", desc);
  return `${TMS_TX_LIST}?${q.toString()}`;
}

function opt(price, unit, productCode, label, query = "") {
  const description = tmsDescriptionQuery(query, label);
  return {
    price,
    unit,
    productCode,
    label,
    query: description,
    href: tmsTransactedHref({ description }),
  };
}

const GENERIC = [
  opt(10, "BAG", "26000228", "Material", "Material"),
  opt(88, "BAG", "26000230", "material a", "Material"),
  opt(99, "UNIT", "26000232", "30-Tonne HGV Tipper", "Material"),
  opt(105, "BAG", "26000229", "Material (Testing)", "Material"),
  opt(195, "BAG", "26000227", "new material requesst A", "Material"),
];

const GROUPS = [
  {
    tags: ["gypsum block", "mkt-gb", "gb-000", "gypsum brick"],
    query: "Gypsum",
    options: [
      opt(33, "SQM", "24000386", "Gypsum block wall system 100mm thick", "Gypsum"),
      opt(100, "SQM", "SP.24-00644", "Gypsum block wall system 100mm thick", "Gypsum"),
      opt(260, "SQM", "10015311", "Gypsum Block Wall", "Gypsum"),
      opt(290, "SQM", "10015315", "Gypsum Block Wall", "Gypsum"),
      opt(340, "SQM", "10015318", "Gypsum Block Wall", "Gypsum"),
    ],
  },
  {
    tags: ["gypsum board", "mkt-t-", "fire-resistant gypsum"],
    query: "Gypsum",
    options: [
      opt(48, "PC", "10014731", "BNBM Standard Gypsum Board", "Gypsum"),
      opt(50, "PC", "10014283", "Gypsum Board", "Gypsum"),
      opt(60, "PC", "10014284", "Gypsum Board", "Gypsum"),
      opt(228, "SQM", "10015306", "Gypsum Board Wall", "Gypsum"),
      opt(290, "SQM", "10015306", "Gypsum Board Wall", "Gypsum"),
    ],
  },
  {
    tags: ["xps", "foam", "xfb", "insulation"],
    query: "XPS",
    options: GENERIC,
  },
  {
    tags: ["mesh", "mkt-mesh", "reinforcement"],
    query: "Mesh",
    options: GENERIC,
  },
  {
    tags: ["safety net", "dmf", "flame retardant"],
    query: "Net",
    options: GENERIC,
  },
];

function hay(line, product) {
  return [
    line?.name,
    line?.productNo,
    line?.baseProductNo,
    line?.category,
    product?.name,
    product?.productNo,
    product?.category,
  ]
    .join(" ")
    .toLowerCase();
}

export function tmsHrefForOption(optRef, line, product) {
  const description = tmsDescriptionQuery(
    optRef?.query,
    optRef?.label,
    line?.category,
    product?.category,
    product?.name,
    line?.name
  );
  return tmsTransactedHref({ description });
}

export function transactedRefsForLine(line, product) {
  const text = hay(line, product);
  const group = GROUPS.find((g) => g.tags.some((tag) => text.includes(tag)));
  const options = (group?.options || GENERIC).slice(0, 5).map((option) => ({
    ...option,
    href: tmsHrefForOption(option, line, product),
  }));
  const prices = options.map((o) => o.price).filter((n) => Number.isFinite(n));
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const unit = options[0]?.unit || "";
  return {
    options,
    min,
    max,
    unit,
    query: group?.query || options[0]?.query || "",
    placeholder: min != null && max != null ? `$${min}–$${max}${unit ? ` / ${unit}` : ""}` : "Unit price",
  };
}
