import { getProductRating } from "../lib/store";
import { useLanguage } from "../i18n";

function StarIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12 2.6 14.7 8.4l6.4.7-4.8 4.3 1.3 6.3L12 16.7 6.4 19.7l1.3-6.3L2.9 9.1l6.4-.7L12 2.6Z"
      />
    </svg>
  );
}

function Stars({ value, size }) {
  return (
    <span className="inline-flex items-center gap-px" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.min(1, Math.max(0, value - (i - 1)));
        return (
          <span key={i} className={`relative ${size}`}>
            <StarIcon className="absolute inset-0 text-[#E2E8E4]" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <StarIcon className={`${size} text-[#4F8F6C]`} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export default function ProductRating({ product, size = "sm", className = "" }) {
  const { t } = useLanguage();
  const { rating, reviews, empty } = getProductRating(product);
  if (empty || !reviews) {
    return (
      <p className={`text-mute ${size === "lg" ? "text-xs" : "text-[10px]"} ${className}`.trim()}>
        {t("noRatingsYet")}
      </p>
    );
  }
  const starSize = size === "lg" ? "h-4 w-4" : "h-3 w-3";
  const score = rating.toFixed(1);

  return (
    <p
      className={`flex items-center gap-1 min-w-0 ${className}`}
      aria-label={t("productRatingAria", { rating: score, n: reviews })}
    >
      <span
        className={`font-semibold tabular-nums text-ink shrink-0 ${
          size === "lg" ? "text-sm" : "text-xs"
        }`}
      >
        {score}
      </span>
      <Stars value={rating} size={starSize} />
      <span className={`text-mute truncate ${size === "lg" ? "text-xs" : "text-[10px]"}`}>
        {t("productReviewsCount", { n: reviews })}
      </span>
    </p>
  );
}
