# Spec — Sales portal · Create TMS iRFQ

Locked UX for Mattex Sales portal RFQ detail / inbox actions.

## Create

- Trigger: **Create TMS iRFQ** (after Accept; also allowed after Submit To Buyer).
- Method: TMS-integration **server bot** logs into TMS and creates one inbound iRFQ from this marketplace RFQ (lines + optional PDF).
- Assignment: `handled_by` is the bot TMS user when that account is the handler; if the portal login email exists as a TMS user, that user is the handler; otherwise handler is left blank.
- Portal TMS password is **not** required to create.

## After iRFQ created (MUST)

1. Save on the RFQ: `tmsId`, `tmsDocumentNo`, details `tmsUrl`.
2. The Create button **becomes** `Open [iRFQ document no.]` (e.g. `Open iRFQ-26000759-01`).
3. Click Open → that iRFQ **details** page, not the inbound list:

`https://uat-tms-v2.mattex.com.hk/inbound/inbound-rfq/{tmsId}`

4. Do not show Create again for an RFQ that already has `tmsDocumentNo`.
