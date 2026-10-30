import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "listed-products.json");

const BIG_CATEGORY = {
  "Structure Steel Element, Metal Product": "結構鋼、金屬製品, Structure Steel Element, Metal Product",
  Board: "板材, Board",
  Tile: "瓷磚, Tiles",
  Tiles: "瓷磚, Tiles",
  "Safety Net": "密目防燃安全網, Dense Mesh Flame Retardant Safety Net",
  "Brick & Block": "磚、砌塊, Brick & Block",
  "Pipe & Fittings & Accessories": "喉管、配件, Pipe & Fittings & Accessories",
  "Manhole & Channel": "沙井、渠道, Manhole & Channel",
  Plastering: "批盪, Plastering",
  "Timber / Plywood": "木材、夾板, Timber / Plywood",
  "Precast Concrete": "預製混凝土, Precasted Concrete",
  "Precasted Concrete": "預製混凝土, Precasted Concrete",
  Aggregate: "石料, Aggregate",
  Barriers: "圍欄, Barriers",
  Waterproofing: "防水, Waterproofing",
  "Cable Containment": "線槽, Cable Containment",
  Insulation: "保溫, Insulation",
};

const SUB_CATEGORY = {
  "Fabric Reinforcement Mesh": "鋼筋網, Reinforcement Mesh",
  "XPS Foam Board": "擠塑板, XPS Foam Board",
  "Gypsum Block": "石膏磚, Gypsum Block",
  "Natural Marble Tiles": "天然大理石磚, Natural Marble Tile",
};

const PHRASES = [
  ["Square Reinforcement Mesh", "方格鋼筋網"],
  ["Rectangular Reinforcement Mesh", "長方格鋼筋網"],
  ["Building Structural Mesh", "結構用鋼筋網"],
  ["Fabric Reinforcement Mesh", "鋼筋網"],
  ["Rigid XPS Insulation Board", "擠塑保溫板"],
  ["Cast Iron Gate Valve", "鑄鐵閘閥"],
  ["Cast Iron Pipe & Fittings", "鑄鐵喉管及配件"],
  ["Copper Pipe & Copper Alloy Fittings", "銅喉及銅合金配件"],
  ["Copper Pressure Reducing Valve", "銅減壓閥"],
  ["Copper Ball Float Valve", "銅浮球閥"],
  ["Copper Check Valve", "銅止回閥"],
  ["Copper Gate Valve", "銅閘閥"],
  ["Copper Globe Valve", "銅截止閥"],
  ["Copper Y-Strainer", "銅Y型隔濾器"],
  ["Ductile Iron Pressure Reducing Valve", "球墨鑄鐵減壓閥"],
  ["Ductile Iron Check Valve", "球墨鑄鐵止回閥"],
  ["Ductile Iron Pipe & Fittings", "球墨鑄鐵喉管及配件"],
  ["Ductile Iron Y-Strainer", "球墨鑄鐵Y型隔濾器"],
  ["Stainless Steel Ball Float Valve", "不銹鋼浮球閥"],
  ["Stainless Steel Pipe & Fittings", "不銹鋼喉管及配件"],
  ["Stainless Steel Angle", "不銹鋼角鋼"],
  ["Stainless Steel Plate", "不銹鋼板"],
  ["Galvanized Steel Pipe & Fittings", "鍍鋅鋼喉及配件"],
  ["Mild Steel Pipe & Fittings", "軟鋼喉管及配件"],
  ["HDPE Pipe & Fittings", "高密度聚乙烯喉管及配件"],
  ["UPVC Pipe & Fittings", "膠喉及配件"],
  ["Other Steel Products", "其他鋼製品"],
  ["Other Tiles — Acoustic Tile", "隔音磚"],
  ["Other Tiles — Cork Tile", "軟木磚"],
  ["Other Tiles — Glass Tile", "玻璃磚"],
  ["Other Tiles — Metal Tile", "金屬磚"],
  ["Other Tiles — Mosaic Tile", "馬賽克"],
  ["Other Tiles", "其他磚"],
  ["Natural Marble Tiles", "天然大理石磚"],
  ["Homogenous Tile", "通體磚"],
  ["Ceramic Tile", "瓷磚"],
  ["Roof Tile", "屋面瓦"],
  ["Tactile Tile", "觸覺引路磚"],
  ["Vinyl Flooring", "膠地板"],
  ["Manhole Cover", "沙井蓋"],
  ["Precast Concrete Block", "預製混凝土磚"],
  ["Precast Concrete Kerb", "預製混凝土路緣"],
  ["Precast Concrete Lintel", "預製混凝土楣樑"],
  ["Precast Concrete Paving", "預製混凝土地磚"],
  ["YTONG AAC Block", "YTONG 加氣混凝土砌塊"],
  ["Non-shrink Grout", "無收縮灌漿料"],
  ["Multi-purpose Waterproofing Mortar", "多用途防水砂漿"],
  ["Multi-purpose Waterproofing Screed", "多用途防水找平砂漿"],
  ["Multi-purpose Screed", "多用途找平砂漿"],
  ["Spray Plaster for Covering", "罩面噴漿批盪"],
  ["Spray Plaster for Wall", "牆身噴漿批盪"],
  ["Tile Adhesive Ultra Strength", "特強瓷磚膠"],
  ["Tile Adhesive Super Strength Grey", "超強瓷磚膠（灰色）"],
  ["Tile Adhesive (Flexible) - White", "柔韌瓷磚膠（白色）"],
  ["Tile Adhesive (Flexible)", "柔韌瓷磚膠"],
  ["Tile Adhesive", "瓷磚膠"],
  ["Tile Grout (High Performance)", "高性能填縫劑"],
  ["Tile Grout (Light)", "淺色填縫劑"],
  ["Tile Grout (Medium)", "中色填縫劑"],
  ["Tile Grout (Dark)", "深色填縫劑"],
  ["Tile Grout", "填縫劑"],
  ["Super Finish for Exterior and Interior", "內外牆超級抹面"],
  ["Super Finish for Interior Use", "內牆超級抹面"],
  ["Base Plaster (Waterproof)", "防水底層批盪"],
  ["Base Plaster", "底層批盪"],
  ["Self-Levelling Screed", "自流平砂漿"],
  ["Floor Screed", "地台砂漿"],
  ["Masonry Mortar", "砌築砂漿"],
  ["Skimcoat (Fine)", "幼身灰"],
  ["Skimcoat", "抹灰"],
  ["Supreme Primer", "高效底漆"],
  ["White faced Plywood", "白板夾板"],
  ["Red faced Plywood", "紅板夾板"],
  ["Filmface Plywood", "菲林板"],
  ["Film Face Plywood", "菲林板"],
  ["Non-FSC Timber Triangle String", "三角線"],
  ["Wood Plastic Composite", "木塑複合板"],
  ["Circular Hollow Sections", "圓形空心型鋼"],
  ["Universal Beams", "工字鋼"],
  ["Equal Angles", "等邊角鋼"],
  ["Sheet Piles", "鋼板樁"],
  ["Round Bar", "圓鋼"],
  ["Steel Plate", "鋼板"],
  ["Reinforcement Bar", "鋼筋"],
  ["Reinforcement Mesh", "鋼筋網"],
  ["Gypsum Block", "石膏磚"],
  ["Gypsum Board", "石膏板"],
  ["Cement Board", "水泥板"],
  ["Partition Board", "間隔板"],
  ["Concrete Additive", "混凝土外加劑"],
  ["Concrete Pipe", "混凝土管"],
  ["Coarse Aggregate", "粗骨料"],
  ["Granular Fill", "粒料回填"],
  ["Acrylic Waterproofing Coating", "丙烯酸防水塗料"],
  ["Bitumen Emulsion Protective Coating", "瀝青乳液保護塗層"],
  ["Cementitious Waterproofing Coating", "水泥基防水塗料"],
  ["Coal Tar Epoxy Coating", "煤焦油環氧塗層"],
  ["Polyethylene Membrane", "聚乙烯防水膜"],
  ["Cable Ladders and Accessories", "電纜梯架及配件"],
  ["Cable Trays and Accessories", "電纜橋架及配件"],
  ["Cable Trunkings and Accessories", "線槽及配件"],
  ["Water Barriers", "水馬"],
  ["Barriers", "圍欄"],
  ["Railing", "欄杆"],
  ["Safety Net", "密目防燃安全網"],
  ["LAH Glasswool", "LAH 玻璃棉"],
  ["Thermal Rock Slab", "岩棉板"],
  ["Kun Lun Marble Design Series", "崑崙大理石系列"],
  ["The Divine Light Series", "神光系列"],
  ["Marble Design Series", "大理石紋系列"],
  ["Artistic Background", "藝術背景"],
  ["Texture · Sintered Stone", "質感燒結石"],
  ["Clay Pipe", "瓦管"],
  ["Aluminum Pipes", "鋁管"],
  ["Waterplug", "速凝止水劑"],
  ["Softwood", "木方（加拿大）"],
  ["Plywood", "夾板"],
  ["Timber", "木材"],
  ["Cement", "水泥"],
  ["Sand", "砂"],
  ["Rockfill", "填石"],
  ["Sub-base", "底基層"],
].sort((a, b) => b[0].length - a[0].length);

let rowsCache = null;

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function listedRows() {
  if (rowsCache) return rowsCache;
  rowsCache = JSON.parse(readFileSync(FILE, "utf8"));
  return rowsCache;
}

function subZh(row) {
  const name = SUB_CATEGORY[row.subcategory] || BIG_CATEGORY[row.category] || "";
  return name.split(",")[0].trim();
}

function categoryName(row) {
  if (row.market === "PRC" && row.subcategory && SUB_CATEGORY[row.subcategory]) return SUB_CATEGORY[row.subcategory];
  return BIG_CATEGORY[row.category] || clean(row.category);
}

function englishProduct(row) {
  return clean(row.product)
    .replace(/^Artisitc background$/i, "Artistic Background")
    .replace(/^Textrue · Sintered Stone$/i, "Texture · Sintered Stone");
}

function splitPhrase(product) {
  const lower = product.toLowerCase();
  const hit = PHRASES.find(([en]) => lower.startsWith(en.toLowerCase()));
  if (!hit) return null;
  const tail = product.slice(hit[0].length).replace(/^[\s—\-–:]+/, "").trim();
  return { zh: hit[1], tail };
}

function mentioned(product, bit) {
  const text = product.toLowerCase();
  const needle = clean(bit).toLowerCase();
  if (!needle) return true;
  if (needle.length <= 3) {
    return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
  }
  if (text.includes(needle)) return true;
  const measure = needle.match(/\d+(?:\.\d+)?\s*mm/);
  return Boolean(measure && text.includes(measure[0].replace(/\s+/g, "")));
}

function displayName(row) {
  const product = englishProduct(row);
  const extra = [row.size, row.packing, row.grade].map(clean).filter((bit) => bit && !mentioned(product, bit));
  const phrase = splitPhrase(product);
  const code = /^\(\d+\)$/.test(product) || /^[A-Z]{1,3}\d+$/.test(product) || /^JL\d+/.test(product);
  if (code) {
    const zh = subZh(row) ? `${product} ${subZh(row)}` : product;
    const en = extra.length ? `${product} — ${extra.join(" — ")}` : product;
    return `${zh}, ${en}`;
  }
  const en = extra.length ? `${product} — ${extra.join(" — ")}` : product;
  if (!phrase) return en;
  let zh = phrase.tail ? `${phrase.zh} — ${phrase.tail}` : phrase.zh;
  if (extra.length) zh = `${zh} — ${extra.join(" — ")}`;
  return `${zh}, ${en}`;
}

function loose(value) {
  return String(value || "").toLowerCase().replace(/[×"”″']/g, "x").replace(/[^a-z0-9.]+/g, "");
}

function detailTokens(row) {
  const tokens = [];
  const size = clean(row.size);
  const dim = size.match(/\d+(?:\.\d+)?\s*["”]?\s*[x×]\s*\d+(?:\.\d+)?/i);
  if (dim) tokens.push(loose(dim[0]));
  for (const part of [row.size, row.packing]) {
    const found = String(part || "").match(/\d+(?:\.\d+)?\s*mm|\d+(?:\.\d+)?\s*kg(?:\s*\/\s*bag)?|\d+\s*\*\s*\d+\s*\*\s*\d+\s*mm|\d+\s*mpa/gi) || [];
    tokens.push(...found.map((item) => loose(item)));
  }
  const grade = clean(row.grade);
  if (grade) tokens.push(loose(`grade${grade}`));
  return [...new Set(tokens.filter((token) => token.length >= 2))];
}

function productKey(product) {
  return String(product?.productNo || "").trim().toUpperCase();
}

function covers(name, token) {
  const text = loose(name);
  if (/^\d+(?:\.\d+)?mm$/.test(token)) {
    const bare = token.replace("mm", "");
    return new RegExp(`(^|[^0-9.])${bare.replace(".", "\\.")}mm(?![0-9])`).test(text);
  }
  return text.includes(token);
}

function claim(products, row, unused) {
  const sku = String(row.sku || "").trim().toUpperCase();
  if (sku.startsWith("MKT-")) {
    const found = products.find((product) => productKey(product) === sku);
    if (found) return found;
  }
  const english = englishProduct(row).toLowerCase();
  const tokens = detailTokens(row);
  const pool = products.filter((product) => unused.has(product.id) && String(product.name || "").toLowerCase().includes(english));
  const detailed = tokens.length ? pool.filter((product) => tokens.every((token) => covers(product.name, token))) : [];
  if (detailed.length) return detailed.sort((a, b) => String(a.name).length - String(b.name).length)[0];
  const exact = pool.filter((product) => {
    const name = String(product.name || "").toLowerCase();
    return name === english || name.startsWith(`${english} —`) || name.startsWith(`${english},`) || name.startsWith(`${english} `);
  });
  if (exact.length) return exact.sort((a, b) => String(a.productNo || "").localeCompare(String(b.productNo || "")))[0];
  return null;
}

function fill(product, row) {
  const name = displayName(row);
  const category = categoryName(row);
  product.name = name;
  if (category) product.category = category;
  if (row.market === "PRC" && row.subcategory && BIG_CATEGORY[row.category]) product.categoryParent = BIG_CATEGORY[row.category];
  else delete product.categoryParent;
  const size = [row.size, row.packing, row.grade].map(clean).filter(Boolean).join(" · ");
  if (size) product.sizeDesc = size;
  if (clean(row.unit)) product.unit = clean(row.unit);
  if (clean(row.lead)) {
    product.leadTime = clean(row.lead);
    product.leadTimeLabel = clean(row.lead);
  }
  if (clean(row.spec)) product.primarySpec = clean(row.spec);
  if (clean(row.cert)) product.certifications = clean(row.cert);
  if (clean(row.purposes)) product.purposes = clean(row.purposes);
  const moq = Number(String(row.moq || "").replace(/,/g, ""));
  if (Number.isFinite(moq) && moq > 0 && String(row.moq).trim() === String(moq)) product.moq = moq;
  if (row.price > 0) {
    product.unit_price = row.price;
    product.listedPrice = true;
    product.priceUponRequest = false;
  }
}

function siblingImage(products, category) {
  const sibling = products.find((product) => product.category === category && product.image);
  return sibling?.image || "";
}

function addProduct(products, row) {
  const name = displayName(row);
  const category = categoryName(row);
  const id = `list-${createHash("sha256").update(`${row.market}|${name}|${row.price || ""}`).digest("hex").slice(0, 12)}`;
  const image = siblingImage(products, category);
  const product = {
    id,
    productNo: `MKT-LIST-${id.slice(5, 11).toUpperCase()}`,
    name,
    category,
    supplier: "Mattex Asia Development Limited",
    unit: clean(row.unit) || "lot",
    unit_price: row.price > 0 ? row.price : null,
    listedPrice: row.price > 0,
    priceUponRequest: !(row.price > 0),
    leadTime: clean(row.lead),
    leadTimeLabel: clean(row.lead),
    sizeDesc: [row.size, row.packing, row.grade].map(clean).filter(Boolean).join(" · "),
    primarySpec: clean(row.spec),
    certifications: clean(row.cert),
    purposes: clean(row.purposes),
    description: clean(row.purposes),
    image,
    imageUrl: image,
    published: true,
    deleted: false,
    held: false,
  };
  if (row.market === "PRC" && row.subcategory && BIG_CATEGORY[row.category]) product.categoryParent = BIG_CATEGORY[row.category];
  products.push(product);
  return product;
}

function foldPrices(rows) {
  const byName = new Map();
  for (const row of rows) {
    if (!row.sku) continue;
    const key = englishProduct(row).toLowerCase();
    const list = byName.get(key) || [];
    list.push(row);
    byName.set(key, list);
  }
  const kept = [];
  for (const row of rows) {
    if (row.sku || !(row.price > 0)) {
      if (row.sku || row.product) kept.push(row);
      continue;
    }
    const same = (byName.get(englishProduct(row).toLowerCase()) || []).filter((item) => !(item.price > 0));
    if (same.length === 1) {
      same[0].price = row.price;
      for (const key of ["size", "packing", "grade", "lead", "unit"]) {
        if (!clean(same[0][key]) && clean(row[key])) same[0][key] = row[key];
      }
      continue;
    }
    kept.push(row);
  }
  return kept;
}

export function applyListedProducts(products) {
  const rows = foldPrices(listedRows());
  const unused = new Set(products.map((product) => product.id));
  const skuRows = rows.filter((row) => String(row.sku || "").startsWith("MKT-"));
  const rest = rows.filter((row) => !String(row.sku || "").startsWith("MKT-"));
  for (const row of [...skuRows, ...rest]) {
    const target = claim(products, row, unused);
    if (target) {
      unused.delete(target.id);
      fill(target, row);
    } else {
      const created = addProduct(products, row);
      unused.delete(created.id);
    }
  }
  return products;
}
