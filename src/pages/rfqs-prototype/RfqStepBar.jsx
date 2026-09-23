/**
 * PROTOTYPE — clickable RFQ lifecycle step bar.
 * Steps are freely selectable so buyers can jump ahead while reviewing layouts.
 */

export const RFQ_LIFECYCLE_STEPS = [
  { id: "submitted", label: "Submitted", short: "1" },
  { id: "quotes", label: "Quotes", short: "2" },
  { id: "purchaseOrder", label: "Purchase Order", short: "3" },
  { id: "payment", label: "Payment", short: "4" },
  { id: "delivery", label: "Delivery & docs", short: "5" },
];

/** Submitted, Quotes, and a processable Purchase Order. Payment / delivery stay out of this phase. */
export const RFQ_PHASE_STEPS = RFQ_LIFECYCLE_STEPS.filter(
  (step) => step.id === "submitted" || step.id === "quotes" || step.id === "purchaseOrder"
);

/** Dev-1 slice: Submitted only. */
export const RFQ_SUBMITTED_STEPS = RFQ_LIFECYCLE_STEPS.filter((step) => step.id === "submitted");

export default function RfqStepBar({ steps = RFQ_PHASE_STEPS, activeId, onSelect, progressId }) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === activeId)
  );
  const progressIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === progressId)
  );

  return (
    <nav aria-label="RFQ steps" className="w-full">
      <ol className="flex items-stretch gap-0 overflow-x-auto border border-line rounded-xl bg-paper/50">
        {steps.map((step, i) => {
          const selected = step.id === activeId;
          const reached = i <= progressIndex;
          return (
            <li key={step.id} className="flex min-w-0 flex-1">
              {i > 0 ? (
                <span
                  className={`hidden sm:block w-px self-stretch shrink-0 ${
                    i <= progressIndex ? "bg-brand-600/40" : "bg-line"
                  }`}
                  aria-hidden
                />
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                aria-current={selected ? "step" : undefined}
                className={`flex-1 min-w-[5.5rem] px-2.5 sm:px-3 py-3 text-left transition-colors ${
                  selected
                    ? "bg-brand-600 text-white"
                    : reached
                      ? "bg-brand-50 text-brand-800 hover:bg-brand-100"
                      : "bg-transparent text-mute hover:bg-white"
                }`}
              >
                <span
                  className={`block text-[10px] font-bold uppercase tracking-[0.14em] ${
                    selected ? "text-white/70" : "text-mute"
                  }`}
                >
                  Step {step.short}
                </span>
                <span className="mt-0.5 block text-xs sm:text-sm font-semibold leading-snug truncate">
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 text-[11px] text-mute sm:hidden">
        Step {activeIndex + 1} of {steps.length}
      </p>
    </nav>
  );
}
