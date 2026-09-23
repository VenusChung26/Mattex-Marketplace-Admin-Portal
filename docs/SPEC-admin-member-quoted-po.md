# Spec — Member quoted list + PO (locked)

For marketplace **My RFQs** (`reviewStatus === quoted` or `rfqDocStatus === quoted`):

- List row shows the **quoted total**.
- Primary action is **View quote**, opening the existing quote compare (Variant A). Do not rebuild compare.
- No in-app notifications.

## Purchase Order

PO must be **clickable and processable** after quotes.

- Step bar includes Submitted, Quotes, and Purchase Order.
- Buyer confirms accepted quote lines and **creates a simple local PO** (persisted on the RFQ).
- Do not use a fake “Simulate” path for PO.

## Out of scope

**Payment and delivery are not required** and are not in the required path. Do not force those steps.
