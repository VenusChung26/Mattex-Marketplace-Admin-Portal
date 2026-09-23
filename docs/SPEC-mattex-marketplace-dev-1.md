# Spec — mattex-marketplace-dev-1 (Submitted slice)

Branch: `mattex-marketplace-dev-1` from `new-feature-admin-portal`.

Flag: `SHOW_RFQ_QUOTES` in `src/lib/flags.js` — **default `false`**. Set `true` to restore Quotes, PO, Submit To Buyer, WhatsApp quote send, TMS iRFQ, and quote versions.

## Buyer (Marketplace)

- Logged-in buyer can submit an RFQ and track it on My RFQs.
- UI stops at **Submitted**. Quotes and Purchase Order are hidden.
- After sales Accept, status is **In review** (`已接收／處理中`). No prices, compare, or PO.
- Guest WhatsApp 即問價 still works. Guest RFQs do **not** appear in My RFQs.

## Sales (Portal)

Inbox lists:

- Member marketplace RFQs
- Guest WhatsApp RFQs

Detail: view lines + **Accept / Reject** + **Follow-up phone** (edit, click to open WhatsApp chat). Not Send quote on WhatsApp.

Hidden while the flag is off: line pricing, Submit To Buyer, WhatsApp quote delivery, TMS iRFQ, quote versions, Assign to member.

## Enough for this slice

Buyer can request a quote, log in to track the RFQ, and admin can accept and follow up by phone. Not enough for quoting, PO, or payment.
