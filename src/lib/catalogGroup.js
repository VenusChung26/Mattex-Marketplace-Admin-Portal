const CODE_RE = /^[A-Z]{1,3}\d{2,4}$/;

function optionFromProduct(product) {
  const size = String(product?.sizeDesc || product?.primarySpec || "").split("\n")[0].trim();
  const head = size.split(/[,;]/)[0].trim();
  return head || String(product?.unit || product?.productNo || product?.id || "");
}

function exactNameParts(product) {
  const name = String(product?.name || "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  return {
    key: `${product.category || ""} :: ${name}`,
    name,
    option: optionFromProduct(product),
  };
}

function groupsFromBuckets(buckets) {
  const groups = [];
  for (const [key, bucket] of buckets) {
    if (bucket.members.length < 2) continue;
    groups.push({
      id: slug(key),
      name: bucket.name,
      members: withUniqueOptions(bucket.members),
    });
  }
  return groups;
}

function nameForOptions(product) {
  const name = String(product?.name || "").replace(/\s+/g, " ").trim();
  const comma = name.indexOf(", ");
  if (comma > 0 && /[\u4e00-\u9fff]/.test(name.slice(0, comma))) return name.slice(0, comma).trim();
  return name;
}

function seriesParts(product) {
  const name = nameForOptions(product);
  const bits = name.split(/\s*[—–]\s*/);
  if (bits.length < 2) return null;
  const left = bits[0].trim();
  const right = bits.slice(1).join(" — ").trim();
  if (!left || !right) return null;
  const code = CODE_RE.test(left);
  const size = String(product.sizeDesc || product.primarySpec || "").split("\n")[0].trim();
  return {
    key: `${product.category || ""} :: ${code ? right : left}`,
    name: code ? right : left,
    option: code ? left : right || size || left,
  };
}

function slug(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return text || "group";
}

function withUniqueOptions(members) {
  const counts = new Map();
  for (const member of members) counts.set(member.option, (counts.get(member.option) || 0) + 1);
  return members.map((member) =>
    counts.get(member.option) > 1 ? { ...member, option: `${member.option} · ${member.productNo || member.productId}` } : member
  );
}

function pushMember(buckets, parts, product) {
  const bucket = buckets.get(parts.key) || { name: parts.name, members: [] };
  bucket.members.push({
    productId: String(product.id),
    productNo: String(product.productNo || ""),
    option: parts.option,
  });
  buckets.set(parts.key, bucket);
}

function leadingCode(value) {
  const match = String(value || "").trim().match(/^([A-Z]{1,3}\d{2,4})\b/);
  return match ? match[1] : "";
}

function optionSize(product) {
  const size = String(product?.sizeDesc || "").split("\n")[0].trim();
  const spec = String(product?.primarySpec || "").split("\n")[0].trim();
  const text = size || (/^\d/.test(spec) && spec.length <= 60 ? spec : "");
  return text;
}

const CUSTOMIZE_SIZE = /^(customize|customization|customize size|customize drawing upload)$/i;

/** "2.1m x 4.8m / Customize" is a size choice plus tailor-made, not part of the model code. */
export function splitSizeChoices(text) {
  const parts = String(text || "")
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || !parts.some((part) => CUSTOMIZE_SIZE.test(part))) return [];
  return parts;
}

export function groupSizeChoices(members) {
  const seen = new Set();
  const choices = [];
  for (const member of members || []) {
    const product = member?.product || member;
    for (const choice of splitSizeChoices(optionSize(product))) {
      const key = choice.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      choices.push(choice);
    }
  }
  return choices.length >= 2 ? choices : [];
}

function parensBalanced(text) {
  let depth = 0;
  for (const char of text) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function splitBilingual(name) {
  let from = 0;
  let found = null;
  while (from < name.length) {
    const comma = name.indexOf(", ", from);
    if (comma < 0) break;
    const left = name.slice(0, comma).trim();
    const right = name.slice(comma + 2).trim();
    if (
      /[\u4e00-\u9fff]/.test(left) &&
      right &&
      !/[\u4e00-\u9fff]/.test(right) &&
      /^[A-Z]/.test(right) &&
      parensBalanced(left)
    ) {
      const leftTail = dashParts(left).slice(1).join(" — ");
      const rightTail = dashParts(right).slice(1).join(" — ");
      found = [left, right];
      if (leftTail && leftTail === rightTail) return found;
    }
    from = comma + 2;
  }
  return found;
}

function dashParts(text) {
  return String(text || "")
    .split(/\s+—\s+|\s+–\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function productStem(text) {
  const bits = dashParts(text);
  if (!bits.length) return "";
  let head = bits[0];
  if (/^Other Tiles$/i.test(head) && bits[1]) head = bits[1];
  head = head.replace(/\s+\((?:White|Grey|Gray)\)\s*$/i, "").trim();
  const hyphen = head.split(/\s+-\s+/);
  if (hyphen.length > 1 && /^(?:Group|Colou?r|Grade)\b/i.test(hyphen[1])) head = hyphen[0];
  return head.trim();
}

const NAME_ZH = {
  "XPS Foam Board": "擠塑板",
};

function joinTitle(zh, en) {
  const left = String(zh || "").trim();
  const right = String(en || "").trim();
  if (left && right && left !== right) return `${left} - ${right}`;
  return left || right;
}

function categoryPair(category) {
  return splitBilingual(String(category || "").replace(/\s+/g, " ").trim());
}

export function shopTitle(product) {
  const name = String(product?.name || "").replace(/\s+/g, " ").trim();
  if (!name) return "";
  if (leadingCode(name)) {
    const pair = categoryPair(product?.category);
    if (pair) return joinTitle(pair[0], pair[1]);
    return productStem(name.replace(/^[A-Z]{1,3}\d{2,4}\s*/, "").split(",")[0].trim() || name);
  }
  const pair = splitBilingual(name);
  if (pair) {
    const zhStem = productStem(pair[0]);
    const enStem = productStem(pair[1]);
    if (!/[\u4e00-\u9fff]/.test(zhStem) && /[\u4e00-\u9fff]/.test(pair[0])) {
      const zh = dashParts(pair[0]).find((bit) => /[\u4e00-\u9fff]/.test(bit)) || zhStem;
      return joinTitle(zh, zhStem);
    }
    return joinTitle(zhStem, enStem);
  }
  const known = NAME_ZH[name];
  if (known) return joinTitle(known, name);
  const category = categoryPair(product?.category);
  if (category && !/[\u4e00-\u9fff]/.test(name) && category[1] === name) return joinTitle(category[0], name);
  return name;
}

export function displayOption(product, fallback = "") {
  const code = leadingCode(product?.variant) || leadingCode(product?.parentProduct) || leadingCode(fallback) || leadingCode(product?.name);
  if (code) {
    const size = optionSize(product).replace(new RegExp(`^${code}\\s*[—–-]?\\s*`, "i"), "").trim();
    if (splitSizeChoices(size).length) return code;
    return size && size !== code ? `${code} — ${size}` : code;
  }
  const parts = seriesParts(product);
  if (parts?.option) {
    const tail = parts.option.split(/\s*[—–]\s*/).pop().trim();
    if (/^colou?r\s*:/i.test(tail)) return String(fallback || product?.variant || tail);
    const saved = String(fallback || "").trim();
    if (saved && saved !== parts.option && saved !== parts.name) return saved;
    return parts.option;
  }
  const zh = nameForOptions(product);
  if (zh && /[\u4e00-\u9fff]/.test(zh)) return zh;
  return String(fallback || optionFromProduct(product) || "");
}

export function optionLabels(members) {
  const labels = (members || []).map((member) => displayOption(member.product || member, member.option));
  const counts = new Map();
  for (const label of labels) counts.set(label, (counts.get(label) || 0) + 1);
  return labels.map((label, index) => {
    if ((counts.get(label) || 0) <= 1) return label;
    const member = members[index];
    const sku = member.productNo || member.product?.productNo || "";
    return sku ? `${label} · ${sku}` : label;
  });
}

const OPTION_PREFIX = /^([^:]{1,48}):\s+/;

/** When every option repeats the same "Grade:" name, that name is the section title. */
export function sharedOptionPrefix(labels) {
  const list = (labels || []).map((label) => String(label || "").trim()).filter(Boolean);
  if (list.length < 2) return "";
  const heads = list.map((label) => {
    const match = label.match(OPTION_PREFIX);
    return match ? match[1].trim() : "";
  });
  if (heads.some((head) => !head) || heads.some((head) => head !== heads[0])) return "";
  return heads[0];
}

export function stripOptionPrefix(label, prefix) {
  const text = String(label || "").trim();
  if (!prefix) return text;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const next = text.replace(new RegExp(`^${escaped}:\\s+`), "").trim();
  return next || text;
}

const SPEC_WORD_ZH = {
  color: "顏色",
  colour: "顏色",
  grade: "等級",
  "grading / option": "等級／選項",
  size: "尺寸",
  type: "類型",
  model: "型號",
  material: "材料",
  length: "長度",
  width: "闊度",
  thickness: "厚度",
  diameter: "直徑",
  grey: "灰色",
  gray: "灰色",
  white: "白色",
  black: "黑色",
  red: "紅色",
  green: "綠色",
  blue: "藍色",
  orange: "橙色",
  yellow: "黃色",
  brown: "棕色",
  beige: "米色",
  pink: "粉紅色",
  purple: "紫色",
  "dark grey": "深灰色",
  "natural concrete": "天然混凝土",
};

export function localizeSpecText(text, lang) {
  const value = String(text || "").trim();
  if (!value || lang !== "zh") return value;
  return SPEC_WORD_ZH[value.toLowerCase()] || value;
}

export function buildExactNameGroups(products) {
  const buckets = new Map();
  for (const product of products || []) {
    if (!product?.id || product.deleted) continue;
    const parts = exactNameParts(product);
    if (!parts) continue;
    pushMember(buckets, parts, product);
  }
  return groupsFromBuckets(buckets);
}

export function buildAutoGroups(products) {
  const buckets = new Map();
  const listed = new Set();
  for (const product of products || []) {
    if (!product?.id || product.deleted) continue;
    const parts = seriesParts(product);
    if (!parts) continue;
    pushMember(buckets, parts, product);
  }
  const groups = [];
  for (const [key, bucket] of buckets) {
    if (bucket.members.length < 2 || bucket.members.length > 12) continue;
    for (const member of bucket.members) listed.add(member.productId);
    groups.push({
      id: slug(key),
      name: bucket.name,
      members: withUniqueOptions(bucket.members),
    });
  }
  const exact = buildExactNameGroups((products || []).filter((product) => product?.id && !listed.has(String(product.id))));
  return [...groups, ...exact];
}

export function indexGroups(groups) {
  const byProduct = new Map();
  for (const group of groups || []) {
    const members = Array.isArray(group?.members) ? group.members : [];
    if (members.length < 2) continue;
    const next = { id: String(group.id), name: String(group.name || ""), members };
    for (const member of members) byProduct.set(String(member.productId), next);
  }
  return byProduct;
}

export function collapseCatalog(products, byProduct) {
  const seen = new Set();
  const out = [];
  for (const product of products || []) {
    const group = byProduct?.get?.(product.id);
    if (!group) {
      out.push({ product, grouped: false, groupName: "" });
      continue;
    }
    if (seen.has(group.id)) continue;
    seen.add(group.id);
    out.push({ product, grouped: true, groupName: group.name });
  }
  return out;
}

function withoutIds(groups, ids) {
  const drop = new Set(ids.map(String));
  return (groups || [])
    .map((group) => ({
      ...group,
      members: group.members.filter((member) => !drop.has(String(member.productId))),
    }))
    .filter((group) => group.members.length >= 2);
}

export function assignProducts(groups, products) {
  const rows = (products || []).filter((product) => product?.id);
  if (rows.length < 2) return groups || [];
  const parts = rows.map(seriesParts).filter(Boolean);
  const shared = parts.length === rows.length && parts.every((part) => part.name === parts[0].name) ? parts[0].name : "";
  const name = shared || String(rows[0].category || rows[0].name || "Product");
  const members = withUniqueOptions(
    rows.map((product) => {
      const part = seriesParts(product);
      return {
        productId: String(product.id),
        productNo: String(product.productNo || ""),
        option: part?.option || String(product.sizeDesc || product.productNo || product.name || product.id),
      };
    })
  );
  return [
    ...withoutIds(groups, rows.map((product) => product.id)),
    { id: `g-${Date.now().toString(36)}`, name, members },
  ];
}

export function releaseProducts(groups, productIds) {
  return withoutIds(groups, productIds || []);
}
