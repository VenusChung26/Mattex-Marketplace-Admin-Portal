/** Phase 2: in-app RFQ records + My RFQs. Marketplace chrome stays the original storefront. */
export const SHOW_RFQ = true;

/**
 * Portal (Sales): quote prices, Submit To Buyer, WhatsApp quote send, TMS iRFQ, quote versions.
 * On for mattex-marketplace-dev-2. Off on mattex-marketplace-dev-1.
 */
export const SHOW_RFQ_QUOTES = true;

/**
 * Portal (Sales): price / qty / remark editors, per-line No offer, Submit To Buyer and WhatsApp quote.
 * Off for now: the inbox shows the buyer's products read-only. Accept, Reject, cancel, assign member and PO stay.
 */
export const SHOW_RFQ_PRICING = false;

/**
 * Marketplace (buyer): show quotes, quote versions and quote PO in My RFQs. Off until Sales sign off,
 * so buyers keep seeing "In review" while Sales already price in the Portal.
 */
export const SHOW_BUYER_QUOTES = false;

/** Catalog Excel import / template. Off this phase. */
export const SHOW_PRODUCT_IMPORT = false;

/** Upload-spec AI product match. On for mattex-marketplace-dev-2. */
export const SHOW_SPEC_MATCH = true;

/** TMS product and iRFQ links and buttons in the Portal. Off: hidden from the frontend. */
export const SHOW_TMS_LINK = false;
