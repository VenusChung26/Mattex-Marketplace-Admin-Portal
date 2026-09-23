import {
  formatQuoteVersionOption,
  formatRfqRequestVersionOption,
  quoteEffectiveVersionNo,
  quoteVersionList,
  rfqRequestEffectiveVersionNo,
  rfqRequestVersionList,
} from "../lib/store";

const DRAFT_VALUE = "draft";

export default function QuoteVersionSelect({
  rfq,
  value,
  onChange,
  showDraft = false,
  draftLabel = "Draft",
  currentLabel = "Current",
  id = "quote-version",
  label = "Quote version",
}) {
  const versions = quoteVersionList(rfq);
  if (!versions.length) return null;
  const effective = quoteEffectiveVersionNo(rfq);
  const selected = value == null || value === "" ? (showDraft ? DRAFT_VALUE : String(effective)) : String(value);

  return (
    <label className="block min-w-[16rem]">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-mute">{label}</span>
      <select
        id={id}
        value={selected}
        onChange={(e) => onChange?.(e.target.value)}
        className="mt-0.5 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink"
      >
        {showDraft ? <option value={DRAFT_VALUE}>{draftLabel}</option> : null}
        {versions.map((version) => (
          <option key={version.version} value={String(version.version)}>
            {formatQuoteVersionOption(version, { effectiveVersion: effective, currentLabel })}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RfqRequestVersionSelect({
  rfq,
  value,
  onChange,
  currentLabel = "Current",
  id = "rfq-version",
  label = "RFQ version",
}) {
  const versions = rfqRequestVersionList(rfq);
  if (!versions.length) return null;
  if (versions.length < 2 && rfq?.reviewStatus !== "revising") return null;
  const effective = rfqRequestEffectiveVersionNo(rfq);
  const selected = value == null || value === "" ? String(effective) : String(value);

  return (
    <label className="block min-w-[16rem]">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-mute">{label}</span>
      <select
        id={id}
        value={selected}
        onChange={(e) => onChange?.(e.target.value)}
        className="mt-0.5 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink"
      >
        {versions.map((version) => (
          <option key={version.version} value={String(version.version)}>
            {formatRfqRequestVersionOption(version, { effectiveVersion: effective, currentLabel })}
          </option>
        ))}
      </select>
    </label>
  );
}

export { DRAFT_VALUE };
