import { splitSizeChoices } from "./catalogGroup.js";
import { pickedSpecFields, findPickedSpecOption, specGroupApplies } from "./productFields.js";

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

function isCustomizeSizeSelection(value) {
  return /^(customize size|custom dimensions)$/i.test(String(value || "").trim());
}

const INLINE_CUSTOM_SKIP = new Set(["floor-size", "mesh-size", "vinyl-size"]);

/** Customize chips become an inline field, except the size groups that open their own dimension inputs. */
export function groupUsesInlineCustomize(group) {
  if (group?.customText) return true;
  if (group?.customUnit || group?.field) return false;
  if (INLINE_CUSTOM_SKIP.has(group?.id)) return false;
  return (group?.options || []).some((item) => {
    const label = selectionOptionLabel(item);
    return isCustomSelection(label) || isCustomizeSizeSelection(label);
  });
}

export function isCustomTextPick(group, value) {
  if (!groupUsesInlineCustomize(group)) return false;
  const text = String(value || "").trim();
  if (!text || /^(custom|customize)$/i.test(text)) return false;
  return !(group.options || []).some((item) => selectionOptionLabel(item) === text || selectionOptionKey(item) === text);
}

export function isCustomUnitPick(group, value) {
  const unit = String(group?.customUnit || "").trim();
  if (!unit) return false;
  const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\d+(?:\\.\\d+)?${escaped}$`, "i").test(String(value || "").trim());
}

function isCustomSelection(value) {
  return /^(customize|customization|customize size|customize drawing upload)$/i.test(String(value || "").trim());
}

function optionNeedsCustomForm(group, option) {
  const label = selectionOptionLabel(option);
  if (groupUsesInlineCustomize(group)) return false;
  if ((group?.id === "mesh-size" || group?.id === "vinyl-size") && isCustomizeSizeSelection(label)) return false;
  if (group?.id === "floor-size" && /^customize$/i.test(label)) return false;
  return isCustomSelection(label);
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

function mergeShoeCustomize(groups) {
  const list = Array.isArray(groups) ? groups : [];
  const model = list.find((group) => group?.id === "shoe-model");
  const custom = list.find((group) => group?.id === "shoe-custom");
  if (!model || !custom) return list;
  const options = [...(model.options || [])];
  if (!options.some((option) => isCustomSelection(selectionOptionLabel(option)))) options.push("Customize");
  return list
    .filter((group) => group?.id !== "shoe-custom")
    .map((group) => (group?.id === "shoe-model" ? { ...group, options } : group));
}

function groupHasMatchingOption(group, picked) {
  if (!specGroupApplies(group, picked)) return false;
  const parent = group?.dependsOn ? picked?.[group.dependsOn] : "";
  return (group?.options || []).some((option) => {
    if (option?.parent && option.parent !== parent) return false;
    if (option?.with && option.with !== picked?.[option.withGroup]) return false;
    return true;
  });
}

function isCustomOnlyGroup(group, picked) {
  const parent = group?.dependsOn ? picked?.[group.dependsOn] : "";
  const usable = (group?.options || []).filter((option) => (!option?.parent || option.parent === parent) && (!option?.with || option.with === picked?.[option.withGroup]));
  return usable.length > 0 && usable.every((option) => isCustomSelection(selectionOptionLabel(option)));
}

/** Same label under the current parent, otherwise the first listed option that is not a custom form. */
function standardOptionForParent(group, picked, preferLabel) {
  const parent = group?.dependsOn ? String(picked?.[group.dependsOn] || "") : "";
  const usable = (option) => {
    if (option?.parent && String(option.parent) !== parent) return false;
    if (option?.with && String(option.with) !== String(picked?.[option.withGroup] || "")) return false;
    const label = selectionOptionLabel(option);
    return !isCustomSelection(label) && !isCustomizeSizeSelection(label);
  };
  const options = group?.options || [];
  if (preferLabel) {
    const same = options.find((option) => usable(option) && selectionOptionLabel(option) === preferLabel);
    if (same) return same;
  }
  return options.find(usable) || null;
}

export function preparedSpecGroups(groups) {
  return dropDrawingGroup(dropXpsGrade(mergeShoeCustomize(mergeSlabCustomize(mergeVinylType(groups))))).filter(
    (group) => group?.field || (group?.options || []).length > 0
  );
}

function optionMatchesWanted(option, wanted) {
  const selected = String(wanted || "");
  if (!selected) return false;
  const key = selectionOptionKey(option);
  const label = selectionOptionLabel(option);
  return key === selected || label === selected || key.endsWith(`::${selected}`);
}

export function initialSpecPicks(groups, preferred) {
  const picked = {};
  const prefer = preferred && typeof preferred === "object" ? preferred : {};
  for (const group of groups || []) {
    if (group.field) {
      picked[group.id] = "";
      continue;
    }
    if (!specGroupApplies(group, picked)) continue;
    const parent = group.dependsOn ? picked[group.dependsOn] : "";
    const usable = (option) => (!option?.parent || option.parent === parent) && (!option?.with || option.with === picked?.[option.withGroup]);
    const standard = (option) => !isCustomSelection(selectionOptionLabel(option)) && !isCustomizeSizeSelection(selectionOptionLabel(option));
    const wanted = prefer[group.id];
    const option = (group.options || []).find((item) => usable(item) && standard(item) && optionMatchesWanted(item, wanted))
      || (group.options || []).find((item) => usable(item) && standard(item));
    if (option) picked[group.id] = selectionOptionKey(option);
  }
  return picked;
}

/** The product's own first listed combination, then the first option under that parent. */
export function openingSpecPicks(product) {
  const groups = preparedSpecGroups(product?.specGroups);
  const first = (product?.specChoices || []).find((choice) => choice?.picks && Object.keys(choice.picks).length);
  return initialSpecPicks(groups, first?.picks);
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
  const corrected = { ...picks };
  for (const group of groups) {
    const value = corrected[group.id];
    if (group.field) {
      const parent = group.dependsOn ? corrected[group.dependsOn] : "";
      const required = isCustomizeSizeSelection(parent) || /^customize$/i.test(String(parent || "").trim());
      const numberOk = Number(value) > 0 && Number.isFinite(Number(value));
      if ((required && !numberOk) || (value && !numberOk)) invalid.push(group.id);
      continue;
    }
    if (!groupHasMatchingOption(group, corrected)) continue;
    const option = findPickedSpecOption(group, corrected);
    if (!option) {
      if (isCustomUnitPick(group, value) || isCustomTextPick(group, value)) continue;
      // Empty, or a listed option from another size/thickness, follows the current parent.
      // A saved option that no longer exists stays invalid.
      const known = value && (group.options || []).find((item) => selectionOptionKey(item) === value || selectionOptionLabel(item) === value);
      if (!value || known) {
        const fallback = standardOptionForParent(group, corrected, known ? selectionOptionLabel(known) : "");
        if (fallback) {
          corrected[group.id] = selectionOptionKey(fallback);
          continue;
        }
      }
      if (!isCustomOnlyGroup(group, corrected)) invalid.push(group.id);
    } else if ((group.customUnit || groupUsesInlineCustomize(group)) && isCustomSelection(String(value || ""))) {
      customPending.push(group.id);
    } else if (optionNeedsCustomForm(group, option)) {
      customPending.push(group.id);
    }
  }
  const size = normalizePickedSize(line?.pickedSize);
  const listedSize = String(product.sizeDesc || "").trim();
  const choices = splitSizeChoices(product.sizeDesc || product.primarySpec);
  if (size && isCustomSelection(size)) customPending.push("size");
  else if (size && isCustomSelection(listedSize)) {
    // The Customize variant stores the buyer's typed dimensions as the size.
  } else if (size && (choices.length ? !choices.includes(size) : size !== listedSize)) invalid.push("size");
  if (invalid.length) return { ok: false, error: "selection_invalid", invalidGroups: [...new Set(invalid)] };
  if (customPending.length) return { ok: false, error: "custom_required", invalidGroups: [...new Set(customPending)] };
  const nextLine = { ...line, pickedSpecs: normalizePickedSpecs(corrected) || line?.pickedSpecs || null };
  const chosen = selectedProduct({ ...product, specGroups: groups }, nextLine);
  const minimum = Math.max(1, Number(chosen.moq) || 1);
  if (!Number.isInteger(Number(line?.qty)) || Number(line.qty) < minimum) return { ok: false, error: "moq", minimum };
  const selectionSnapshot = snapshotSelection({ ...product, specGroups: groups }, nextLine);
  return { ok: true, product: chosen, line: { ...nextLine, lineId: lineReference(nextLine), selectionSnapshot } };
}

export function selectionMessage(error, lang = "zh", minimum, invalidGroups) {
  const missing = invalidGroups || [];
  if (error === "selection_invalid" && missing.length && missing.every((id) => id === "mesh-width" || id === "mesh-length")) {
    return lang === "en" ? "Enter the width and length." : "請填寫闊度及長度。";
  }
  if (error === "selection_invalid" && missing.length && missing.every((id) => id === "floor-thickness" || id === "floor-width" || id === "floor-length")) {
    return lang === "en" ? "Enter the size." : "請填寫尺寸。";
  }
  if (error === "custom_required" && missing.length === 1 && (missing[0] === "wpc-size" || missing[0] === "clad-size" || missing[0] === "ladder-size")) {
    return lang === "en" ? "Enter the size." : "請填寫尺寸。";
  }
  if (error === "custom_required" && missing.length === 1 && (missing[0] === "ladder-spec" || missing[0] === "wpc-spec" || missing[0] === "floor-spec" || missing[0] === "clad-spec")) {
    return lang === "en" ? "Enter the spec." : "請填寫規格。";
  }
  if (error === "custom_required" && missing.length === 1 && missing[0] === "paving-colour") {
    return lang === "en" ? "Enter the colour." : "請填寫顏色。";
  }
  if (error === "custom_required" && missing.length === 1 && (missing[0] === "kerb-length" || missing[0] === "dowel-length" || missing[0] === "ply-length")) {
    return lang === "en" ? "Enter the length." : "請填寫長度。";
  }
  if (error === "custom_required") {
    return lang === "en" ? "Enter the custom specification before submitting." : "請填寫自訂規格後再提交。";
  }
  const messages = lang === "en" ? {
    selection_invalid: "Choose one of the available specifications.",
    moq: "The minimum quantity has changed. Confirm your quantity before submitting.",
    catalog_unavailable: "We could not verify the latest product options. Your draft is saved; please retry.",
    unavailable: "This product can no longer be ordered. Your draft is saved.",
  } : {
    selection_invalid: "請選擇目前提供的規格。",
    moq: "最低購買量已更新，請確認並調整數量後再提交。",
    catalog_unavailable: "暫時無法核對最新商品資料，草稿已保留，請重試。",
    unavailable: "此商品暫時無法訂購，草稿已保留。",
  };
  return messages[error] ? `${messages[error]}${error === "moq" && minimum ? ` (${minimum})` : ""}` : "";
}
