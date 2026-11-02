import { contactFormFromAccount, contactPayload } from "./phone.js";

/** Guest RFQ / PO contact. Names only — file bytes stay in the form until upload, never in browser storage. */

export const GUEST_ATTACHMENT_KINDS = ["namecard", "bq", "drawing", "spec", "image", "other"];

/** File bytes stay in this tab until the WhatsApp upload. Never written to browser storage. */
const guestFileBytes = new Map();

export function rememberGuestFile(id, file) {
  const key = String(id || "");
  if (!key || !file) return;
  guestFileBytes.set(key, file);
}

export function forgetGuestFile(id) {
  guestFileBytes.delete(String(id || ""));
}

/** Resolve the files the guest still has in this tab. Does not drop them, so a failed upload can retry. */
export function guestUploadFiles(list) {
  return (Array.isArray(list) ? list : [])
    .map((item) => {
      const id = String(item?.id || "");
      const file = guestFileBytes.get(id);
      if (!file) return null;
      return { id, name: String(item?.name || file.name || "file").slice(0, 180), file };
    })
    .filter(Boolean)
    .slice(0, 12);
}

export function releaseGuestUploadFiles(list) {
  for (const item of Array.isArray(list) ? list : []) forgetGuestFile(item?.id);
}

const ATTACHMENT_LABELS = {
  namecard: "名片",
  bq: "BQ",
  drawing: "圖則",
  spec: "規格",
  image: "產品圖片",
  other: "其他",
};

/** Prefill the same order form from a member account. Empty fields stay mandatory. */
export function memberOrderSeed(account) {
  const user = account || {};
  return {
    ...emptyGuestOrder(),
    ...contactFormFromAccount(user),
    companyName: String(user.companyName || "").trim(),
    contactName: String(user.name || "").trim(),
    email: String(user.email || "").trim(),
    address: String(user.companyAddress || user.address || "").trim(),
    project: String(user.project || "").trim(),
  };
}

export function emptyGuestOrder() {
  return {
    companyName: "",
    address: "",
    contactName: "",
    email: "",
    phone: "",
    phoneRegion: "852",
    phoneOtherCode: "",
    phoneNational: "",
    addPhone: false,
    phone2Region: "852",
    phone2OtherCode: "",
    phone2National: "",
    whatsappOn: "",
    wechatOn: "",
    project: "",
    deliveryDate: "",
    deliveryNa: false,
    remark: "",
    attachments: [],
  };
}

export function guestOrderPayload(info) {
  const src = info || {};
  const deliveryNa = Boolean(src.deliveryNa) || String(src.deliveryDate || "").trim().toUpperCase() === "N/A";
  const phones = contactPayload(src);
  const phone = (phones.phone || String(src.phone || "")).trim().slice(0, 40);
  const otherPhone = (phones.otherPhone || (src.addPhone ? "" : String(src.otherPhone || ""))).trim().slice(0, 40);
  const slot = (value) => (value === "1" || value === "2" ? value : "");
  return {
    email: String(src.email || "").trim().toLowerCase(),
    name: String(src.contactName || src.name || "").trim().slice(0, 120),
    phone,
    otherPhone,
    whatsappOn: slot(phones.whatsappOn || src.whatsappOn),
    wechatOn: slot(phones.wechatOn || src.wechatOn),
    companyName: String(src.companyName || "").trim().slice(0, 160),
    address: String(src.address || "").trim().slice(0, 400),
    project: String(src.project || "").trim().slice(0, 200),
    deliveryDate: deliveryNa ? "N/A" : String(src.deliveryDate || "").trim().slice(0, 20),
    remark: String(src.remark || "").trim().slice(0, 600),
    attachments: (Array.isArray(src.attachments) ? src.attachments : [])
      .map((file) => ({
        id: String(file?.id || "").slice(0, 80),
        kind: file?.kind === "file" || !GUEST_ATTACHMENT_KINDS.includes(file?.kind) ? "file" : file.kind,
        name: String(file?.name || "").trim().slice(0, 180),
      }))
      .filter((file) => file.name)
      .slice(0, 12),
  };
}

export function guestOrderError(info) {
  const row = guestOrderPayload(info);
  if (!row.companyName) return "company";
  if (!row.address) return "address";
  if (!row.name) return "contact";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.email)) return "email";
  if (!row.phone) return "phone";
  if (info?.addPhone && !row.otherPhone) return "phone2";
  if (!row.project) return "project";
  if (!row.deliveryDate) return "delivery_date";
  return "";
}

export function attachmentSummary(files) {
  return (Array.isArray(files) ? files : [])
    .map((file) => {
      const name = String(file?.name || "").trim();
      if (!name) return "";
      if (!file?.kind || file.kind === "file") return name;
      const label = ATTACHMENT_LABELS[file.kind];
      return label ? `${label}：${name}` : name;
    })
    .filter(Boolean)
    .join("；");
}
