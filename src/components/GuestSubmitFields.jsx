import { useRef, useState } from "react";
import { RequiredMark } from "./AccountForm";
import { BuyerPhoneFields } from "./BuyerContactFields";
import { useLanguage } from "../i18n";
import { forgetGuestFile, rememberGuestFile } from "../lib/guestOrder";
import DateField from "./DateField";

const inputClass = "field-input w-full";

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label} <RequiredMark />
      </span>
      {children}
      {error ? (
        <span data-form-alert className="mt-1 block text-xs font-medium text-red-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}

/**
 * Guest RFQ / PO section. Required marks are red.
 * File names stay in form state. The bytes are not written to browser storage.
 */
export default function GuestSubmitFields({ value, onChange, errorField = "" }) {
  const { t } = useLanguage();
  const row = value || {};
  const attachments = Array.isArray(row.attachments) ? row.attachments : [];
  const fileRef = useRef(null);
  const rowRef = useRef(row);
  rowRef.current = row;
  const [dragOver, setDragOver] = useState(false);

  function patch(next) {
    const merged = { ...rowRef.current, ...next };
    rowRef.current = merged;
    onChange?.(merged);
  }

  function addFiles(list) {
    const incoming = [...(list || [])].filter(Boolean);
    if (!incoming.length) return;
    const next = [...attachments];
    for (const file of incoming) {
      if (next.length >= 12) break;
      const id = `${Date.now()}-${next.length}-${file.name}`;
      rememberGuestFile(id, file);
      next.push({ id, kind: "file", name: file.name || "file" });
    }
    patch({ attachments: next });
  }

  return (
    <div id="guest-order-fields" className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-brand-800 sm:text-lg">{t("guestOrderSection")}</h2>
        <p className="mt-1 text-xs text-mute">{t("guestOrderHint")}</p>
      </div>
      <Field label={t("companyName")} error={errorField === "company" ? t("guestCompanyRequired") : ""}>
        <input
          className={inputClass}
          value={row.companyName || ""}
          placeholder={t("guestPhCompany")}
          autoComplete="organization"
          onChange={(e) => patch({ companyName: e.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("guestContactName")} error={errorField === "contact" ? t("guestContactRequired") : ""}>
          <input
            className={inputClass}
            value={row.contactName || ""}
            placeholder={t("phFullName")}
            autoComplete="name"
            onChange={(e) => patch({ contactName: e.target.value })}
          />
        </Field>
        <Field label={t("email")} error={errorField === "email" ? t("guestEmailInvalid") : ""}>
          <input
            type="email"
            className={inputClass}
            value={row.email || ""}
            placeholder={t("phEmail")}
            autoComplete="email"
            onChange={(e) => patch({ email: e.target.value })}
          />
        </Field>
      </div>
      <BuyerPhoneFields
        t={t}
        value={row}
        required
        errors={{
          phone: errorField === "phone" ? t("guestPhoneRequired") : "",
          phone2: errorField === "phone2" ? t("guestPhoneRequired") : "",
        }}
        onChange={(key, value) => patch({ [key]: value })}
      />
      <Field label={t("deliveryAddress")} error={errorField === "address" ? t("guestAddressRequired") : ""}>
        <textarea
          rows={2}
          className={inputClass}
          value={row.address || ""}
          placeholder={t("addressPlaceholder")}
          autoComplete="street-address"
          onChange={(e) => patch({ address: e.target.value })}
        />
      </Field>
      <Field label={t("projectName")} error={errorField === "project" ? t("guestProjectRequired") : ""}>
        <input
          className={inputClass}
          value={row.project || ""}
          placeholder={t("projectPlaceholder")}
          onChange={(e) => patch({ project: e.target.value })}
        />
      </Field>
      <Field label={t("requestDeliveryDate")} error={errorField === "delivery_date" ? t("deliveryDateRequired") : ""}>
        <DateField
          value={row.deliveryDate && row.deliveryDate !== "N/A" ? row.deliveryDate : ""}
          invalid={errorField === "delivery_date"}
          onChange={(next) => patch({ deliveryDate: next, deliveryNa: false })}
        />
      </Field>
      <div>
        <span className="mb-1 block text-sm font-medium">{t("guestAttachments")}</span>
        <p className="mb-2 text-xs text-mute">{t("guestAttachmentsHint")}</p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer?.files);
          }}
          className={`flex w-full items-center justify-center rounded-lg border border-dashed px-4 py-6 text-sm ${
            dragOver ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line bg-paper/50 text-mute"
          }`}
        >
          {t("guestAttachDrop")}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {attachments.length ? (
          <ul className="mt-2 space-y-1 text-sm">
            {attachments.map((file) => (
              <li key={file.id || file.name} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{file.name}</span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-mute hover:text-red-700"
                  onClick={() => {
                    forgetGuestFile(file.id);
                    patch({ attachments: attachments.filter((item) => item !== file) });
                  }}
                >
                  {t("remove")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
