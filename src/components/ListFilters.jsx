import { commonFilterGroups, listOptionCount, withTilePatch } from "../lib/tileBrowse.js";

function optionLabel(option, lang) {
  return lang === "en" ? option.en : option.zh;
}

function Check({ checked, label, count, image, onChange }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-1.5 border px-2 py-1 text-sm ${checked ? "border-brand-600/40 bg-brand-50 text-brand-800" : "border-line bg-white text-ink hover:border-brand-600/40"}`}>
      <input type="checkbox" className="accent-brand-700" checked={checked} onChange={onChange} />
      {image ? <img src={image} alt="" className="h-5 w-5 shrink-0 object-cover" /> : null}
      <span className="leading-snug">{label}</span>
      {count == null ? null : <span className="tabular-nums text-mute">({count})</span>}
    </label>
  );
}

export default function ListFilters({ lang, products, state, onChange }) {
  const zh = lang !== "en";
  const vinylState = { ...state, kind: "vinyl" };
  const groups = commonFilterGroups(["vinyl"], vinylState);

  function commit(patch) {
    onChange(withTilePatch(vinylState, patch));
  }

  function toggle(groupId, optionId) {
    const list = (vinylState[groupId] || []).includes(optionId)
      ? vinylState[groupId].filter((id) => id !== optionId)
      : [...(vinylState[groupId] || []), optionId];
    commit({ [groupId]: list });
  }

  if (!groups.length) return null;

  return (
    <section className="mb-4 border border-line bg-white" aria-label={zh ? "篩選" : "Filters"}>
      {groups.map((group) => (
        <div key={group.id} className="border-b border-line px-3 py-2 last:border-b-0">
          <p className="mb-2 text-xs font-semibold text-ink">{zh ? group.titleZh : group.titleEn}</p>
          <div className={`flex flex-wrap gap-1.5 ${group.swatch ? "max-h-36 overflow-y-auto" : ""}`}>
            {group.options.map((option) => (
              <Check
                key={option.id}
                checked={(vinylState[group.id] || []).includes(option.id)}
                label={optionLabel(option, lang)}
                image={group.swatch ? option.image : ""}
                count={listOptionCount(products, vinylState, group.id, option.id)}
                onChange={() => toggle(group.id, option.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
