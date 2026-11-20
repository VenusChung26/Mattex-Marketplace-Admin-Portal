import { kindLabel, optionCount, tileFilterGroups, TILE_KINDS, withTilePatch } from "../lib/tileBrowse.js";

function optionLabel(option, lang) {
  return lang === "en" ? option.en : option.zh;
}

function CheckRow({ checked, label, count, onChange }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm ${checked ? "bg-brand-50 text-brand-800" : "text-ink hover:bg-paper"}`}>
      <input type="checkbox" className="mt-1 accent-brand-700" checked={checked} onChange={onChange} />
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
      {count == null ? null : <span className="shrink-0 tabular-nums text-mute">({count})</span>}
    </label>
  );
}

function GroupTitle({ children }) {
  return <p className="bg-paper px-3 py-2 text-xs font-semibold leading-5 text-ink">{children}</p>;
}

export default function TileBrowse({ lang, state, entries, onChange, contained = false, nested = false }) {
  const zh = lang !== "en";
  const shownKind = state.kind || "ceramic";
  const groups = tileFilterGroups(shownKind);

  function commit(patch) {
    onChange(withTilePatch({ ...state, kind: state.kind || shownKind }, patch));
  }

  function toggle(groupId, optionId) {
    const list = state[groupId].includes(optionId)
      ? state[groupId].filter((id) => id !== optionId)
      : [...state[groupId], optionId];
    commit({ [groupId]: list });
  }

  return (
    <nav
      aria-label={zh ? "磚分類" : "Tile categories"}
      className={nested
        ? "flex flex-col bg-paper"
        : contained
          ? "flex max-h-[50vh] flex-col overflow-y-auto border border-line bg-white lg:max-h-none lg:overflow-visible"
          : "flex max-h-[50vh] flex-col overflow-y-auto border border-line bg-white lg:sticky lg:top-[88px] lg:max-h-[calc(100dvh-100px)]"}
    >
      <div className="border-b border-line">
        <GroupTitle>{zh ? "細分類" : "Type"}</GroupTitle>
        <div role="radiogroup" aria-label={zh ? "細分類" : "Type"}>
          {TILE_KINDS.map((kind) => {
            const on = kind.id === state.kind;
            return (
              <label key={kind.id} className={`flex cursor-pointer items-start gap-2 border-t border-line px-3 py-2 text-sm ${on ? "bg-brand-50 font-semibold text-brand-800" : "text-ink hover:bg-paper"}`}>
                <input
                  type="radio"
                  name="tile-kind"
                  className="mt-1 accent-brand-700"
                  checked={on}
                  onChange={() => commit({ kind: kind.id })}
                />
                <span className="min-w-0 leading-snug">{kindLabel(kind)}</span>
              </label>
            );
          })}
        </div>
      </div>
      {groups.map((group) => {
        const sections = group.sections || [{ titleZh: "", titleEn: "", options: group.options }];
        return (
          <div key={group.id} className="border-b border-line" role="group" aria-label={zh ? group.titleZh : group.titleEn}>
            <GroupTitle>{zh ? group.titleZh : group.titleEn}</GroupTitle>
            {sections.map((section, index) => (
              <div key={section.titleEn || group.id} className={index > 0 ? "border-t border-line" : ""}>
                {section.titleZh ? (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold leading-5 text-mute">
                    {zh ? section.titleZh : section.titleEn}
                  </p>
                ) : null}
                {section.options.map((option) => (
                  <CheckRow
                    key={option.id}
                    checked={state.kind ? state[group.id].includes(option.id) : false}
                    label={optionLabel(option, lang)}
                    count={optionCount(entries, { ...state, kind: shownKind }, group.id, option.id)}
                    onChange={() => toggle(group.id, option.id)}
                  />
                ))}
              </div>
            ))}
            {group.customized === "size" ? (
              <CheckRow
                checked={Boolean(state.sizeCustom)}
                label={zh ? "自訂 Customized" : "Customized"}
                onChange={() => commit({ sizeCustom: !state.sizeCustom })}
              />
            ) : null}
            {group.customized === "slip" ? (
              <CheckRow
                checked={Boolean(state.slipCustom)}
                label={zh ? "自訂 Customized" : "Customized"}
                onChange={() => commit({ slipCustom: !state.slipCustom })}
              />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
