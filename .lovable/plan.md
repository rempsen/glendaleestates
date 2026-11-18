# Unit 24 corrections and live office editing for Noni

## Goal
Buyers get a clear, itemized quote they can trust. BMD staff such as Noni can change selections, prices and notes during a meeting and see the new totals right away.

Note: Unit 24 is on file as **Deb Safiniuk**. The notes call the buyer "Mike". I will treat the notes as being about Unit 24.

## Part 1 — Itemized quote (screen, PDF, Word)
Each line shows: room/location, product and colour, quantity, unit price, line total, and a status:
- **Included** (standard, $0)
- **Upgrade** (counts toward the total)
- **Pending price** (shown as "Pending", never $0, and left out of the total with a clear notice)
- **Disputed / under review** (shown, flagged, and left out of the committed total until resolved)
- **Deferred** (shown in its own list and left out of the total)

The quote then shows standard inclusions, upgrade charges, subtotal before GST, GST (5%), and the total. All totals are worked out from the line items.

## Part 2 — Unit 24 corrections (record and wording)
- Remove Laundry from the tile selection. Laundry stays LVP.
- Rename "Bedroom Flooring" and "Bedroom Carpet Colour" to **Primary Bedroom**. This applies to every unit.
- Show premium underpad as two separate lines: **Primary Bedroom** and **Basement Stairs**, each with its own price/status.
- Add "Stair Flooring – Carpet" (stairs to the lower level, Windsor 8208 Catalyst).
- Change the main-floor note to: "LVP in the laundry room and second bedroom, flowing from the kitchen."
- Remove the statement that upgraded underpad carries through the basement.
- Add the basement underpad as **Deferred — pending Karma's estimate**.
- Mark the LVP colour as **Provisional — to be chosen by Deb (meeting Nov 26)**. Note: "Not Lloyd Minister."
- Mark the $1,005 stair carpet/underpad line as **Under review**, compared against the standard carpet. It is not removed.
- Window coverings: list five roller shades by location (2 Primary Bedroom blackout, 1 second bedroom, 1 living room, 1 front entrance) plus 2 patio door shades and their motorization as separate lines. Add a note field explaining why different-size windows are priced the same.
- Reconciliation note for staff: $9,966 − $1,290 + $1,005 = $9,681 before GST (matches the current system total, which is not yet approved). Flag "2 × $637.50 = $1,347" as wrong (should be $1,275), with the $72 difference listed for review.

I will not invent any prices. Every line whose price is unknown stays "Pending".

## Part 3 — Live editing for staff
Expand the office pricing editor on the submission so staff can:
- Add, edit, duplicate and remove lines, and change the room, product, quantity, unit price, status and note on each.
- Use a dedicated **Basement** section (scope, decisions, notes, pricing lines).
- Swap a provisional selection for the final one.
- See "Saved" / error messages, totals that update immediately, and a **Client preview** button that shows exactly what the buyer will see.
- Rely on these safeguards: only admins can save pricing (checked by the database, not just the screen), and every change is recorded in the change log.

## Part 4 — Client review and follow-ups
- **Word export** (.docx) of current selections, the itemized quote, client notes and open questions. Staff can edit it in Word.
- A **Follow-ups** list on each submission, pre-filled for Unit 24:
  - viewing locations for the patio/roller blinds
  - OSB subfloor thickness
  - disputed stair pricing
  - bedroom blind inclusions
  - basement pricing (Karma)
- Follow-ups print as "Open questions" on the Word export. On the buyer PDF, internal wording is left out.

## Verification
- Tests for: pending/deferred/disputed lines left out of totals; the line-total arithmetic; GST; a non-admin save being rejected.
- Sign in as Noni, edit Unit 24 live, save, reload, then check that the screen, PDF, Word file and Excel export all show the same total.

## Decisions I need from you
1. The $1,005 stair line: count it in the committed total while it is under review, or hold it out?
2. Prices for the separate patio-blind and motorization lines, and what the $5,361 includes. Until I have them, these lines stay "Pending", or I keep the current combined price.
3. Should the Word export also go out to buyers, or is it staff-only?

## Technical details
- Extend `custom_pricing.customItems` with `status` ('included'|'upgrade'|'pending'|'disputed'|'deferred'), `area` (incl. 'basement'), `qty`, `unitPrice`, `note`. Old records default to 'upgrade'. `computeUpgradeTotals` / `computeUpgradeTotalsServer` count only 'upgrade' lines with a numeric price, and report the pending/deferred/disputed lists separately (AGENTS.md rule kept).
- Add `custom_pricing.followUps[]` and `custom_pricing.provisional{field:note}`.
- A validation trigger on `buyer_selections` rejects `custom_pricing` changes unless `has_role(auth.uid(),'admin')`. The existing audit log keeps recording changes.
- The Word export uses the `docx` package, built from the same buyer-safe mapper as the PDF, plus an optional staff section.
- Update label maps for "Primary Bedroom". Unit 24 data edits go through run_sql with audit-log entries.
