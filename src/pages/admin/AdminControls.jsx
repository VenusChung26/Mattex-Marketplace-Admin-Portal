import { useLanguage } from "../../i18n";
import { adminText } from "../../lib/adminCopy";

export function AdminSearchBar({ value, onChange, placeholder, label }) {
  return (
    <label className="mb-4 block">
      <span className="sr-only">{label || placeholder}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-mute focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
      />
    </label>
  );
}

export function FilterTabs({ tabs, counts, value, onChange, label }) {
  const { lang } = useLanguage();
  const pt = (value) => adminText(lang, value);
  return (
    <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1" role="tablist" aria-label={label}>
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-brand-600 text-white" : "text-mute hover:bg-brand-50 hover:text-ink"
            }`}
          >
            {pt(tab.label)}
            <span className={`tabular-nums text-[11px] ${active ? "text-white/80" : "text-mute"}`}>{counts[tab.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}


export const STICKY_ACTION_TH =
  "sticky right-0 top-0 z-20 bg-brand-50 px-3 py-2 shadow-[-8px_0_12px_-8px_rgba(16,21,19,0.2)]";
export const STICKY_ACTION_TD =
  "sticky right-0 z-[1] bg-white px-3 py-2 shadow-[-8px_0_12px_-8px_rgba(16,21,19,0.14)]";

export function ViewToggle({ value, onChange, label = "RFQ view" }) {
  const { lang } = useLanguage();
  const pt = (value) => adminText(lang, value);
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-1" role="group" aria-label={pt(label)}>
      {[
        { id: "card", label: "Cards" },
        { id: "list", label: "List" },
      ].map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              active ? "bg-brand-600 text-white" : "text-mute hover:bg-brand-50 hover:text-ink"
            }`}
          >
            {pt(item.label)}
          </button>
        );
      })}
    </div>
  );
}

