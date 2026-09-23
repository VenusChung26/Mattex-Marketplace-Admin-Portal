# Spec — Quote versions on one RFQ (locked)

Quote revisions are **v1 → v2 of the same RFQ**. Do not mint a new RFQ id.

## When a version is created

A version is created **only when the quote is successfully delivered to the buyer**:

- **Member:** `quoteRfqToBuyer` (Submit To Buyer / Update quote to buyer)
- **Guest:** sales clicks **Quote sent on WhatsApp** after opening WhatsApp

Worksheet price edits are **draft only** until that send. Do not auto-save a version per keystroke.

First successful delivery = **v1**. Each later successful send appends **v2, v3, …** on the same RFQ.

## Effective version

**Effective version = last successfully delivered.** Always one current.

Switching the dropdown is **view**, not making effective.

## Same dropdown, both surfaces (Q7-A / Q11-A)

Portal RFQ detail **and** marketplace My RFQs quote page use the same list.

Label: `v1`, `v2`, … + sent datetime + **Current** on the effective version.

## One timeline after guest WhatsApp then Assign then Submit (Q12-A)

WhatsApp sends are v1, v2; later member Submit To Buyer is **v3 on the same list**.

Do not drop WhatsApp history. Do not keep two numbering schemes.

`quoteRfqToBuyer` still returns `{ error: "guest" }` and does **not** set `reviewStatus: quoted` while the buyer is a guest.

## Old version → become effective again (Q8-A)

Cannot resend a historical freeze in place.

Sales **Load into draft** (overwrites the current worksheet draft), then Update / Send, which freezes a **new** version.

Confirm if load would overwrite a **dirty** draft.

## PO (Q9-A)

Purchase orders only against the **effective** version.

If the dropdown is on an old version, PO is disabled or still bound to effective — never create a PO from a historical snapshot.

## Portal worksheet (Q10-A)

Selecting an old version = **read-only preview** of that freeze.

Editable line prices only when viewing **Draft**.

Explicit **Return to Draft** control.

## Guest public tokens

Keep frozen old `/zh/quote/:token` URLs.

Map each WhatsApp send into the same version list (`quotePublicTokens` / snapshots).

Member send freezes a snapshot the same way so My RFQs can preview v1 vs v2 (not overwrite-only).

## Quote compare

Do **not** treat multi-supplier Variant A as versions. Real Mattex sales quotes use this version list.

```jsx
// ❌ BAD — new RFQ id per revision, or version-per-keystroke
createRfqFromQuote(v2);

// ❌ BAD — dropdown switch makes that version effective
setEffective(viewedVersion);

// ✅ GOOD
quoteRfqToBuyer(rfq.id); // appends vN, effective = vN
markGuestQuoteWhatsappSent(rfq.id); // appends vN, quoteDelivery whatsapp only
```
