import { AccountField } from "./AccountForm";
import { PHONE_REGIONS } from "../lib/phone";

function PhoneInputs({ t, region, otherCode, national, onRegion, onOtherCode, onNational, invalid = false }) {
  return (
    <div className="flex gap-2">
      <div className="relative shrink-0" style={{ width: "9.5rem", flex: "0 0 9.5rem" }}>
      <select
        className="field-input w-full appearance-none"
        style={{ paddingRight: "2.35rem" }}
        value={region || "852"}
        onChange={(e) => onRegion(e.target.value)}
        aria-label={t("phoneRegion")}
      >
        {PHONE_REGIONS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mute"
        style={{ right: "0.95rem" }}
        aria-hidden
      >
        <path d="M4.2 6.2 8 10 11.8 6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      </div>
      {region === "other" ? (
        <input
          type="text"
          inputMode="numeric"
          className="field-input shrink-0"
          style={{ width: "5.5rem", flex: "0 0 5.5rem" }}
          value={otherCode || ""}
          onChange={(e) => onOtherCode(e.target.value)}
          placeholder="+Code"
          aria-label={t("phoneRegion")}
        />
      ) : null}
      <input
        type="tel"
        value={national || ""}
        onChange={(e) => onNational(e.target.value)}
        placeholder={t("phMobilePhone")}
        className="field-input min-w-0"
        style={{ width: "auto", flex: "1 1 12rem" }}
        autoComplete="tel-national"
        aria-invalid={invalid ? true : undefined}
      />
    </div>
  );
}

function PurposeChecks({ t, slot, whatsappOn, wechatOn, onToggle }) {
  const whatsappTaken = slot === "2" && whatsappOn === "1";
  const wechatTaken = slot === "2" && wechatOn === "1";
  return (
    <div className="mt-2 flex flex-col gap-2">
      <label className={`inline-flex items-center gap-2 text-sm ${whatsappTaken ? "text-mute" : "text-ink"}`}>
        <input
          type="checkbox"
          checked={whatsappOn === slot}
          disabled={whatsappTaken}
          onChange={() => onToggle(slot, "whatsapp")}
        />
        {t("numberIsWhatsapp")}
      </label>
      <label className={`inline-flex items-center gap-2 text-sm ${wechatTaken ? "text-mute" : "text-ink"}`}>
        <input
          type="checkbox"
          checked={wechatOn === slot}
          disabled={wechatTaken}
          onChange={() => onToggle(slot, "wechat")}
        />
        {t("numberIsWechat")}
      </label>
    </div>
  );
}

export function BuyerPhoneFields({ t, value, onChange, errors = {}, required = true }) {
  function togglePurpose(slot, kind) {
    const key = kind === "whatsapp" ? "whatsappOn" : "wechatOn";
    if (slot === "2" && value[key] === "1") return;
    onChange(key, value[key] === slot ? "" : slot);
  }

  function toggleAddPhone() {
    if (value.addPhone) {
      onChange("addPhone", false);
      onChange("phone2National", "");
      onChange("phone2OtherCode", "");
      onChange("phone2Region", "852");
      if (value.whatsappOn === "2") onChange("whatsappOn", "");
      if (value.wechatOn === "2") onChange("wechatOn", "");
      return;
    }
    onChange("addPhone", true);
  }

  const phoneLabel = t("mobilePhone");
  const otherLabel = t("otherPhone");

  return (
    <>
      <AccountField asLabel={false} label={phoneLabel} required={required} error={errors.phone}>
        <PhoneInputs
          t={t}
          region={value.phoneRegion}
          otherCode={value.phoneOtherCode}
          national={value.phoneNational}
          onRegion={(next) => onChange("phoneRegion", next)}
          onOtherCode={(next) => onChange("phoneOtherCode", next)}
          onNational={(next) => onChange("phoneNational", next)}
          invalid={Boolean(errors.phone)}
        />
        <PurposeChecks
          t={t}
          slot="1"
          whatsappOn={value.whatsappOn}
          wechatOn={value.wechatOn}
          onToggle={togglePurpose}
        />
      </AccountField>
      {value.addPhone ? null : (
        <button type="button" className="w-fit justify-self-start text-left text-sm font-semibold text-brand-700 hover:text-brand-800" onClick={toggleAddPhone}>
          {t("addAnotherPhone")}
        </button>
      )}
      {value.addPhone ? (
        <AccountField asLabel={false} label={otherLabel} required={required} error={errors.phone2}>
          <PhoneInputs
            t={t}
            region={value.phone2Region}
            otherCode={value.phone2OtherCode}
            national={value.phone2National}
            onRegion={(next) => onChange("phone2Region", next)}
            onOtherCode={(next) => onChange("phone2OtherCode", next)}
            onNational={(next) => onChange("phone2National", next)}
            invalid={Boolean(errors.phone2)}
          />
          <PurposeChecks
            t={t}
            slot="2"
            whatsappOn={value.whatsappOn}
            wechatOn={value.wechatOn}
            onToggle={togglePurpose}
          />
          <button type="button" className="mt-2 text-xs font-semibold text-mute hover:text-[#8a2b2b]" onClick={toggleAddPhone}>
            {t("deleteProject")}
          </button>
        </AccountField>
      ) : null}
    </>
  );
}

export function BuyerContactFields({ t, value, onChange, errors = {} }) {
  const roles = Array.isArray(value.roles) ? value.roles : [];

  function toggleRole(role) {
    const next = roles.includes(role) ? roles.filter((item) => item !== role) : [...roles, role];
    onChange("roles", next);
  }

  return (
    <>
      <AccountField asLabel={false} label={t("accountRoles")} required error={errors.roles}>
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={roles.includes("contractor")} onChange={() => toggleRole("contractor")} />
            {t("roleContractor")}
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={roles.includes("buyer")} onChange={() => toggleRole("buyer")} />
            {t("roleBuyer")}
          </label>
        </div>
      </AccountField>
      <BuyerPhoneFields t={t} value={value} onChange={onChange} errors={errors} />
    </>
  );
}
