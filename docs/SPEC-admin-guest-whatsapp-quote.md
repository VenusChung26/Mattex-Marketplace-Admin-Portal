# Spec — Guest quote on WhatsApp (locked)

Guest buyers have **no Mattex Marketplace account / My RFQs**. Sales must not send a portal quote to them as if they were a member.

## Submit To Buyer

- **Always disabled** while `rfqBuyerKind !== "member"`.
- `quoteRfqToBuyer` returns `{ error: "guest" }` and does **not** set `reviewStatus: quoted`.

## Send quote on WhatsApp (RFQ detail)

Primary quote-delivery CTA sits in the **same row** as Submit To Buyer.

- First send: **Send quote on WhatsApp**.
- After a successful send-mark: **Update quote on WhatsApp**.
- Enable only when: RFQ is **accepted** (or already quoted-offline via WhatsApp), every offerable line has a unit price, and Follow-up has a **parseable phone**. Otherwise disable and point sales to fill Follow-up.

Send:

1. Freeze a snapshot at send time (lines, prices, totals, deadline, RFQ id).
2. Persist a public token + payload (shared store / localStorage).
3. Open `https://wa.me/{id}?text=...` (`buyerWhatsappHref` with prefilled Traditional Chinese: RFQ id, line prices / total, quotation deadline, public quote URL).
4. Public URL is on **marketplace origin** (`5178`), default `/zh/quote/:token`. Not the admin portal.

**Update quote on WhatsApp** creates a **new** token/URL. The old link keeps the old prices.

## Quote sent on WhatsApp

Enabled only after WhatsApp was opened **this attempt** (track Send / `window.open`). Sales must click it to persist:

- `quoteDelivery: "whatsapp"`
- `quoteDeliveredAt`

This is **not** `reviewStatus: quoted` and must **not** go through `quoteRfqToBuyer`.

## Follow-up (Q14-B)

- If a phone exists: the slot shows the **formatted number**. Clicking it still opens WhatsApp chat.
- If empty: the **same slot** is the input.
- **Send quote** is the quote-delivery CTA, not the tiny number link alone.

## Public quote page (Q17-B)

- Route `/:lang/quote/:token` (no login, not a claim into My RFQs).
- Mobile-readable sheet: RFQ no., lines, prices, total, deadline.
- Download the **frozen** PDF (`buildQuotePdf` from the snapshot).
- Portal **Download PDF** stays the live current worksheet.

## After send (Q16-A)

**Assign to registered member** still works. Then Submit To Buyer can send into My RFQs.

Create TMS iRFQ stays available as today.

## Quote versions (one timeline)

WhatsApp sends and a later marketplace Submit To Buyer share **one version list** on the same RFQ (`v1`, `v2`, …). See `docs/SPEC-admin-quote-versions.md`.

- Each **Quote sent on WhatsApp** appends the next version (`channel: "whatsapp"`) and maps that send’s frozen token/snapshot.
- Old public `/zh/quote/:token` URLs stay frozen.
- After Assign, **Submit To Buyer** is `vN+1` (`channel: "marketplace"`). Do not drop WhatsApp history or restart numbering.

## Language (Q21-A)

WhatsApp prefill is Traditional Chinese. Portal chrome stays English.
