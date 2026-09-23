# Spec — Guest RFQ cannot go to marketplace

Guest buyers have **no Mattex Marketplace account / My RFQs**. Sales must not send a portal quote to them as if they were a member.

## Submit To Buyer

- **Member RFQ:** Submit To Buyer / Update quote to buyer writes the quote into that buyer’s My RFQs.
- **Guest RFQ:** those buttons are **disabled**. `quoteRfqToBuyer` returns `guest` and does not change marketplace quote state.
- Tooltip / flash: Guest has no marketplace account. Assign a member, or WhatsApp the quote.

## How to handle a guest RFQ

1. **Assign to registered member** (Buyer panel, type to search name / email / company) → RFQ becomes Member → Submit To Buyer works.
2. **Send quote on WhatsApp** (see `docs/SPEC-admin-guest-whatsapp-quote.md`) — freeze a public quote page, then mark **Quote sent on WhatsApp**. This is not `reviewStatus: quoted`.
3. **Create TMS iRFQ** still works — that is internal, not marketplace.

Do not show “Quote submitted to buyer” / “Update quote to buyer” as a marketplace send while the buyer is still Guest.

