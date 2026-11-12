import { splitSizeChoices } from "./catalogGroup.js";
import { pickedSpecFields, findPickedSpecOption } from "./productFields.js";

export function normalizePickedSpecs(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value).map(([key, value]) => [String(key).trim(), String(value ?? "").trim()])
    .filter(([key, value]) => key && value);
  return entries.length ? Object.fromEntries(entries) : null;
}

export function normalizePickedSize(value) {
  return String(value || "").trim().slice(0, 120);
}

export function selectionKey(line) {
  const id = String(line?.productId || "");
  if (line?.custom) return id;
  const picks = Object.entries(normalizePickedSpecs(line?.pickedSpecs) || {}).sort(([a], [b]) => a.localeCompare(b));
  const size = normalizePickedSize(line?.pickedSize);
  return picks.length || size ? `selection:${encodeURIComponent(JSON.stringify([id, size, picks]))}` : id;
}

export function lineReference(line) {
  return String(line?.lineId || selectionKey(line));
}

export function identifyLine(line) {
  return { ...line, lineId: lineReference(line) };
}

export function findSelectionLine(lines, reference) {
  const key = String(reference || "");
  const exact = (lines || []).find((line) => lineReference(line) === key);
  if (exact) return exact;
  const legacy = (lines || []).filter((line) => String(line.productId) === key);
  return legacy.length === 1 ? legacy[0] : null;
}

export function selectedProduct(product, line) {
  if (!product) return null;
  const facts = pickedSpecFields(preparedSpecGroups(product.specGroups), line?.pickedSpecs || {}, product.specChoices);
  return { ...product, ...(Object.hasOwn(facts, "unit_price") ? { unit_price: facts.unit_price } : {}), ...Object.fromEntries(Object.entries({
    productNo: facts.sku, description: facts.summary || facts.detail, moq: facts.moq,
    unit: facts.unit, leadTime: facts.leadTime, leadTimeLabel: facts.leadTimeLabel, specs: facts.specs,
  }).filter(([, value]) => value != null && value !== "")) };
}

export function snapshotSelection(product, line) {
  const chosen = selectedProduct(product, line);
  if (!chosen) return null;
  const fields = ["id", "name", "productNo", "description", "sizeDesc", "primarySpec", "parentProduct", "variant",
    "category", "unit", "salesUnit", "moq", "specs", "leadTime", "leadTimeLabel",
    "image", "imageUrl", "imageFallback", "standard", "certifications", "tailorMade"];
  const facts = Object.fromEntries(fields.filter((key) => chosen[key] !== undefined).map((key) => [key, chosen[key]]));
  facts.specGroups = (product.specGroups || []).map((group) => ({ ...group,
    options: (group.options || []).filter((option) => option === findPickedSpecOption(group, line?.pickedSpecs || {})),
  }));
  return { product: structuredClone(facts), pickedSpecs: normalizePickedSpecs(line?.pickedSpecs), pickedSize: normalizePickedSize(line?.pickedSize) };
}

export function selectionDescription(product, line) {
  const rows = (product.specGroups || []).map((group) => {
    const pick = line?.pickedSpecs?.[group.id];
    const option = findPickedSpecOption(group, line?.pickedSpecs || {});
    return pick ? `${group.label || group.labelEn || group.id}: ${selectionOptionLabel(option) || pick}` : "";
  }).filter(Boolean);
  if (line?.pickedSize) rows.push(`尺寸: ${line.pickedSize}`);
  return [product.description, ...rows].filter(Boolean).join("\n");
}

export function selectionOptionLabel(option) {
  return String(option && typeof option === "object" ? option.label || option.key || "" : option || "");
}

export function selectionOptionKey(option) {
  return String(option && typeof option === "object" ? option.key || option.label || "" : option || "");
}

function isCustomSelection(value) {
  return /^(customize|customization|customize size|customize drawing upload)$/i.test(String(value || "").trim());
}

function mergeVinylType(groups) {
  const list = Array.isArray(groups) ? groups : [];
  const homo = list.find((group) => group?.id === "vinyl-homo");
  const hetero = list.find((group) => group?.id === "vinyl-hetero");
  if (!homo || !hetero) return list;
  const merged = {
    id: "vinyl-type",
    label: "分類 1",
    labelEn: "Category 1",
    options: [...(homo.options || []), ...(hetero.options || [])],
  };
  const next = [];
  let placed = false;
  for (const group of list) {
    if (group?.id === "vinyl-homo" || group?.id === "vinyl-hetero") {
      if (!placed) {
        next.push(merged);
        placed = true;
      }
      continue;
    }
    next.push(group);
  }
  return next;
}

function dropDrawingGroup(groups) {
  const list = Array.isArray(groups) ? groups : [];
  return list.filter((group) => {
    const options = group?.options || [];
    if (!options.length) return true;
    return !options.every((option) => /drawing upload/i.test(selectionOptionLabel(option)));
  });
}

function dropXpsGrade(groups) {
  const list = Array.isArray(groups) ? groups : [];
  if (!list.some((group) => group?.id === "xps-grade")) return list;
  return list.filter((group) => group?.id !== "xps-grade");
}

function mergeSlabCustomize(groups) {
  const list = Array.isArray(groups) ? groups : [];
  const size = list.find((group) => group?.id === "slab-size");
  const custom = list.find((group) => group?.id === "slabs-custom");
  if (!size || !custom) return list;
  const options = [...(size.options || [])];
  if (!options.some((option) => isCustomSelection(selectionOptionLabel(option)))) options.push("Customize");
  return list
    .filter((group) => group?.id !== "slabs-custom")
    .map((group) => (group?.id === "slab-size" ? { ...group, options } : group));
}

export function preparedSpecGroups(groups) {
  return dropDrawingGroup(dropXpsGrade(mergeSlabCustomize(mergeVinylType(groups)))).filter(
    (group) => group?.field === "length" || (group?.options || []).length > 0
  );
}

export function initialSpecPicks(groups) {
  const picked = {};
  for (const group of groups || []) {
    const option = (group.options || []).find((option) => !option?.parent || option.parent === picked[group.dependsOn]);
    picked[group.id] = group.field ? "" : selectionOptionKey(option);
  }
  return picked;
}

export function resolveSelection(product, line) {
  if (line?.custom && String(line.productId || "").startsWith("custom_")) return { ok: true, line };
  if (!product || product.published === false || product.deleted || product.held || product.discontinued) {
    return { ok: false, error: "unavailable" };
  }
  const picks = normalizePickedSpecs(line?.pickedSpecs) || {};
  const groups = preparedSpecGroups(product.specGroups);
  const byId = new Map(groups.map((group) => [group.id, group]));
  const invalid = Object.keys(picks).filter((id) => !byId.has(id));
  const customPending = [];
  for (const group of groups) {
    const value = picks[group.id];
    if (group.field) {
      if (value && !(Number(value) > 0 && Number.isFinite(Number(value)))) invalid.push(group.id);
      continue;
    }
    const option = findPickedSpecOption(group, picks);
    if (!option) invalid.push(group.id);
    else if (isCustomSelection(selectionOptionLabel(option))) customPending.push(group.id);
  }
  const size = normalizePickedSize(line?.pickedSize);
  const choices = splitSizeChoices(product.sizeDesc || product.primarySpec);
  if (size && isCustomSelection(size)) customPending.push("size");
  else if (size && (choices.length ? !choices.includes(size) : size !== String(product.sizeDesc || "").trim())) invalid.push("size");
  if (invalid.length) return { ok: false, error: "selection_invalid", invalidGroups: [...new Set(invalid)] };
  if (customPending.length) return { ok: false, error: "custom_required", invalidGroups: [...new Set(customPending)] };
  const chosen = selectedProduct({ ...product, specGroups: groups }, line);
  const minimum = Math.max(1, Number(chosen.moq) || 1);
  if (!Number.isInteger(Number(line?.qty)) || Number(line.qty) < minimum) return { ok: false, error: "moq", minimum };
  const selectionSnapshot = snapshotSelection({ ...product, specGroups: groups }, line);
  return { ok: true, product: chosen, line: { ...line, lineId: lineReference(line), selectionSnapshot } };
}

export function selectionMessage(error, lang = "zh", minimum) {
  if (error === "custom_required") {
    return lang === "en" ? "Enter the custom specification before submitting." : "請填寫自訂規格後再提交。";
  }
  const messages = lang === "en" ? {
    selection_invalid: "Enter the custom specification before submitting.",
    moq: "The minimum quantity has changed. Confirm your quantity before submitting.",
    catalog_unavailable: "We could not verify the latest product options. Your draft is saved; please retry.",
    unavailable: "This product can no longer be ordered. Your draft is saved.",
  } : {
    selection_invalid: "請填寫自訂規格後再提交。",
    moq: "最低購買量已更新，請確認並調整數量後再提交。",
    catalog_unavailable: "暫時無法核對最新商品資料，草稿已保留，請重試。",
    unavailable: "此商品暫時無法訂購，草稿已保留。",
  };
  return messages[error] ? `${messages[error]}${error === "moq" && minimum ? ` (${minimum})` : ""}` : "";
}
