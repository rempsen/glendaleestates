# Phase 1 — Relief for Noni: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every upgrade a BMD staff member can select in the submission editor priced, visible, overridable and correctly printed, with live totals and no internal text reaching buyers — on the current data model, shipping this week.

**Architecture:** All changes stay inside the existing two-engine design (`src/lib/upgradeTotals.ts` client, `supabase/functions/_shared/upgradeTotalsServer.ts` edge) and the existing `buyer_selections` columns + `custom_pricing` JSON. A fixture of the nine live submissions pins today's totals so every task proves it changed only what it meant to. New engine inputs are threaded through every caller in one task so client, PDF, Word, email, QBO and PM never disagree.

**Tech Stack:** React 18 + TypeScript + shadcn/ui (Vite), Supabase (Postgres, Deno edge functions), `bun test`, jsPDF, `docx`. Lovable ↔ GitHub two-way sync; Lovable Publish deploys.

**Spec:** `docs/superpowers/specs/2026-11-18-quote-lines-redesign-design.md` §8 "Phase 1" (items 2–12; item 1 shipped as `fa3141b`), §6.14, §11.

## Global Constraints

- Both engines change together; `computeUpgradeTotals` and `computeUpgradeTotalsServer` must return identical `grandSubtotal` for the same input (spec §3, AGENTS.md rule 2).
- Every caller passes the full input including `customPricing` (AGENTS.md rule 2).
- Money: amounts pre-GST CAD; GST = 5% of committed subtotal; markup 60% from `pricing_config.markup_percentage`; never hardcode a price in UI copy (spec §6.10).
- Buyer-facing renderers (`buyerPdfGenerator.ts` with `staff=false`, `submissionWordExport.ts` with `staff=false`, buyer email HTML) must print no `internal_note`/`sales_comments`/`admin_notes`/area `comments` (spec §2 anti-goals, AGENTS.md rule 1).
- `status = 'pending'` lines never print `$0.00`; they print `Pending` (spec §6.1).
- Historical totals of the 9 live submissions change only where this plan says so, and each such change is reported to Dan before the code ships (spec §2 goal 7, §6.4).
- Pull before every change (`git pull --rebase origin main`); `bun test` green before every push; one commit per task; Lovable Publish is a human step after the final push.
- No new dependencies.

## Review Focus

1. A carpet-bedroom buyer whose *second* bedroom was upgraded to LVP via `area_upgrades` must have bedroom premium carpet/underpad priced on the primary bedroom only, not both bedrooms (Unit 24 shape). Test in Task 3.
2. A `custom_pricing.overrides.stairCarpet.amount` of `0` (explicit zero, e.g. "waived") must price the stair carpet line at $0 and drop the line, not fall back to the $840 default. Test in Task 2.
3. Saving the editor on a record that has Section-4 `heated_floor_bathrooms = 2` and no per-area `heatedFloor` must keep 2 (Unit 37 shape), not overwrite with 0. Test in Task 5.
4. The itemize-windows helper run twice must not duplicate lines: second run is a no-op when the integer quantities are already 0. Test in Task 8.
5. `send-selections-email` called with a valid JWT whose email differs from `body.email` must reject with 403 and write nothing; a DB insert failure must return 500 and send no email. Tests in Task 10.

---

### Task 1: Live-submission fixture and parity test (baseline)

**Files:**
- Create: `scripts/fixtures/live-submissions.json`
- Create: `scripts/fixtures/pricing-snapshot.json`
- Create: `scripts/parity.test.ts`
- Create: `scripts/lib/fixturePricing.ts`

**Interfaces:**
- Produces: `loadFixturePricing(snapshot): UpgradeTotalsPricing` in `scripts/lib/fixturePricing.ts` — builds the pricing object exactly as `loadSavedSubmissionContext` does in `src/lib/savedSubmissionPdf.ts:22-48` but from JSON. Produces `EXPECTED_SUBTOTALS: Record<string, number>` inside `scripts/parity.test.ts` keyed by unit number.
- Consumes: `computeUpgradeTotals`, `totalsInputFromSelections` (`src/lib/buyerPdfGenerator.ts:821`), `toBuyerPdfSelections` (`src/lib/buyerPdfSelections.ts:5`).

- [ ] **Step 1: Export the fixture data.** Run against the live DB (Lovable `query_database` or `psql`) and save the JSON rows:
  - `live-submissions.json`: `select row_to_json(b) from buyer_selections b order by unit_number::int` — then replace `first_name`/`last_name` with `Buyer`/`Unit-<n>`, `email` with `unit<n>@example.com`, `phone_number` with `null`, and blank `sales_comments`, `admin_notes`, `window_comments`, `lvp_comments`, `spc_tile_comments`. Keep every pricing-relevant column untouched.
  - `pricing-snapshot.json`: `{ pricing_config: [...], upgrade_materials: [...], unit_area_data: [...] }` from the three tables (all columns).
- [ ] **Step 2: Write `loadFixturePricing(snapshot)`** in `scripts/lib/fixturePricing.ts` returning `UpgradeTotalsPricing` with the same key mapping as `savedSubmissionPdf.ts:22-48` (`fee()` returns 0 when `is_active` is false; `getStairCarpetUpgradePrice` → `premium_carpet_stairs_price`; `getStairUnderpadUpgradePrice` → `premium_underpad_stairs_price`).
- [ ] **Step 3: Write the parity test** `scripts/parity.test.ts`:

```ts
import { test, expect } from 'bun:test';
// for each submission in the fixture:
//   const totals = computeUpgradeTotals(totalsInputFromSelections(toBuyerPdfSelections(row), normalizeUnitTypeCode(row.unit_type)), pricing)
//   expect(totals.grandSubtotal).toBeCloseTo(EXPECTED_SUBTOTALS[row.unit_number], 2)
```
  Fill `EXPECTED_SUBTOTALS` by running the engine once on the fixture at HEAD and pasting the numbers (Unit 24 must read `10388.40`). Add a second test that `grandTotal === grandSubtotal * 1.05` for every row.
- [ ] **Step 4: Run** `bun test scripts/parity.test.ts` — Expected: PASS, 9 + 9 assertions.
- [ ] **Step 5: Record the motorization backfill check** (spec §8 item 8) as a comment at the top of `parity.test.ts`: on 2026-11-18, `window_total` vs `((additional×673.50)+(patio×2,680.50))×1.05` implied motorization only for Unit 24 (already backfilled); Units 2, 4 and 38 carry `window_total` values from older price lists (3,172.37 / 3,172.37 / 2,984.94) and no backfill. No further writes.
- [ ] **Step 6: Commit** `test: pin live-submission totals as a parity fixture`.

---

### Task 2: Apply `stairCarpet` / `stairUnderpad` overrides in both engines + panel inputs

**Files:**
- Modify: `src/lib/upgradeTotals.ts:214-222`
- Modify: `supabase/functions/_shared/upgradeTotalsServer.ts:75,262-266`
- Modify: `src/components/admin/CustomPricingPanel.tsx:18-24` (override key list)
- Test: `scripts/custom-pricing.test.ts`

**Interfaces:**
- Produces: `OverrideKey` unchanged in shape (`stairCarpet`, `stairUnderpad` already declared); engines now honour `overrides.stairCarpet.amount` / `overrides.stairUnderpad.amount`. Server `OvKey` gains `'stairCarpet' | 'stairUnderpad'`.

- [ ] **Step 1: Write failing tests** in `scripts/custom-pricing.test.ts`:

```ts
test('stairCarpet override replaces the $840 flat rate', () => {
  const t = computeUpgradeTotals({ unitTypeCode: 'C', areaUpgrades: [], stairPremiumCarpetSelected: true,
    customPricing: { overrides: { stairCarpet: { amount: 700 } } } }, pricing /* getStairCarpetUpgradePrice: () => 840 */);
  expect(t.pieces.stairCarpet).toBe(700);
});
test('stairCarpet override of 0 waives the line', () => {
  const t = computeUpgradeTotals({ ...sameInput, customPricing: { overrides: { stairCarpet: { amount: 0 } } } }, pricing);
  expect(t.pieces.stairCarpet).toBe(0);
  expect(t.lineItems.find(l => l.group === 'stair' && /Carpet/.test(l.label))).toBeUndefined();
});
test('stairUnderpad override replaces the $165 flat rate', /* amount 100 → pieces.stairUnderpad === 100 */);
```
- [ ] **Step 2: Run** `bun test scripts/custom-pricing.test.ts` — Expected: FAIL (values 840 / 165).
- [ ] **Step 3: Implement** in `upgradeTotals.ts`: wrap the two computations with `ov('stairCarpet', …, input.stairPremiumCarpetSelected && !isStairLvp)` and `ov('stairUnderpad', …, input.stairPremiumUnderpadSelected && !isStairLvp)`. Mirror in `upgradeTotalsServer.ts` (extend `OvKey`, apply the server's override helper at lines 263 and 265).
- [ ] **Step 4: Add the two keys to the panel's override list** at `CustomPricingPanel.tsx:18-24` with labels `Stairs to Lower Level — Premium Carpet` and `Stairs to Lower Level — Premium Underpad`.
- [ ] **Step 5: Run** `bun test` — Expected: all PASS including parity (no live unit uses these overrides).
- [ ] **Step 6: Commit** `fix(pricing): honour stairCarpet/stairUnderpad office overrides in both engines`.

---

### Task 3: Price bedroom premium carpet and premium underpad in both engines

**Files:**
- Modify: `src/lib/upgradeTotals.ts` (`UpgradeTotalsInput`, `OverrideKey`, `UpgradeTotalsResult.pieces`, body)
- Modify: `supabase/functions/_shared/upgradeTotalsServer.ts` (`ServerTotalsInput`, `OvKey`, body)
- Modify: `src/lib/buyerPdfGenerator.ts:821-840` (`totalsInputFromSelections`)
- Test: `scripts/bedroom-premium.test.ts` (new)

**Interfaces:**
- Produces, on `UpgradeTotalsInput` and `ServerTotalsInput`:
  - `bedroomFlooringChoice?: 'carpet' | 'lvp' | string | null`
  - `bedroomPremiumCarpetSelected?: boolean`
  - `bedroomPremiumUnderpadSelected?: boolean`
- `OverrideKey`/`OvKey` gain `'bedroomCarpet' | 'bedroomUnderpad'`.
- `pieces` gains `bedroomCarpet: number`, `bedroomUnderpad: number`, `bedroomCarpetSqyd: number`.
- Pricing rule (both engines): `sqyd = unitData.masterBedroom + (secondBedroomIsHard ? 0 : unitData.secondBedroomCarpet)` where `secondBedroomIsHard = areaUpgrades.some(a => a.areaId === 'secondBedroom' && /lvp|lvt|laminate|hardwood|tile/i.test(String(a.materialType)))`. Lines exist only when `bedroomFlooringChoice === 'carpet'`. `bedroomCarpet = ov('bedroomCarpet', sqyd × getMaterialCost('carpet') × (1 + markup))`; `bedroomUnderpad = ov('bedroomUnderpad', sqyd × getMaterialCost('premium_carpet_underpad') × (1 + markup))`. Both join `upgradesSubtotal`. Line items: group `'flooring'`, labels `Premium Carpet — Bedrooms (${sqyd} sq yd)` and `Premium Underpad — Bedrooms (${sqyd} sq yd)` unless an override label is set; when `secondBedroomIsHard`, the word `Bedrooms` becomes `Primary Bedroom`.
- `totalsInputFromSelections` maps `selections.bedroomFlooringChoice`, `selections.premiumCarpetBedroom`, `selections.premiumUnderpadBedroom` onto the three new fields.

- [ ] **Step 1: Write failing tests** `scripts/bedroom-premium.test.ts` with Type C areas (`masterBedroom: 44, secondBedroomCarpet: 24`), `getMaterialCost: carpet 25, premium_carpet_underpad 6`, markup 0.6:
  - both bedrooms carpet, underpad selected → `pieces.bedroomUnderpad === 652.8`, `bedroomCarpetSqyd === 68`
  - second bedroom has `{areaId:'secondBedroom', materialType:'nonstandard_lvp'}` → `pieces.bedroomUnderpad === 422.4`, label contains `Primary Bedroom`
  - carpet selected → `pieces.bedroomCarpet === 2720`
  - `bedroomFlooringChoice: 'lvp'` with both flags true → both pieces `0`, no lines
  - override `bedroomUnderpad.amount: 400` → `pieces.bedroomUnderpad === 400`
- [ ] **Step 2: Run** `bun test scripts/bedroom-premium.test.ts` — Expected: FAIL (fields unknown / 0).
- [ ] **Step 3: Implement** in `upgradeTotals.ts` after the stair block, then mirror in `upgradeTotalsServer.ts`; update `totalsInputFromSelections`.
- [ ] **Step 4: Run** `bun test` — Expected: `bedroom-premium` PASS; **parity FAILS for Unit 7 only** (its `premium_underpad_bedroom = true`, carpet bedrooms, Corner Unit J: expected new subtotal = old + `(25 + 22) × 6 × 1.6 = 451.20`). Confirm the delta is exactly that.
- [ ] **Step 5: Report to Dan** (SendUserMessage or in the PR description): "Unit 7 (Karen B.) selected premium underpad in the wizard in April; it was never priced. New subtotal +$451.20. Approve, or set `overrides.bedroomUnderpad.amount = 0` to waive." Do not proceed to Step 6 until answered; if waived, write the override via the admin panel and log it.
- [ ] **Step 6: Update `EXPECTED_SUBTOTALS['7']`** in `scripts/parity.test.ts` to the approved value with a comment citing the date and Dan's answer.
- [ ] **Step 7: Run** `bun test` — Expected: all PASS.
- [ ] **Step 8: Commit** `feat(pricing): price bedroom premium carpet/underpad in both engines; Unit 7 parity updated per Dan 2026-11-xx`.

---

### Task 4: Thread the new inputs through every caller and add editor toggles

**Files:**
- Modify every call site found by `rg -n "computeUpgradeTotals\(|computeUpgradeTotalsServer\(" src supabase` — known: `src/pages/AdminSubmissions.tsx:112-175`, `src/components/UpgradePricingSummary.tsx`, `src/hooks/useUpgradePricing.ts`, `src/lib/projectManagementData.ts`, `src/lib/submissionLineItems.ts`, `src/lib/emailPreview.ts`, `src/lib/submissionPdfGenerator.ts`, `src/lib/submissionExportBuilder.ts`, `src/lib/submissionFlatExport.ts`, `src/hooks/useDashboardData.ts`, `src/pages/AdminSalesAnalytics.tsx`, `supabase/functions/send-selections-email/index.ts:840,1927`, `resend-confirmation-email/index.ts:236`, `qbo-sync-submission/index.ts:283`, `audit-pricing-consistency/index.ts:123`.
- Modify: `src/components/admin/SubmissionEditor.tsx` (bedroom section ~`:520-548`; `updatePayload` ~`:262-290`)
- Modify: `src/lib/buyerPdfGenerator.ts:405-406` (remove the two "Selected" rows — they are now priced lines)
- Modify: `supabase/functions/send-selections-email/index.ts:112-113` (CSV rows become amounts from totals)
- Test: `scripts/callers.test.ts` (new)

**Interfaces:**
- Consumes Task 3's three fields. Every caller that builds an input from a `buyer_selections` row must go through `totalsInputFromSelections(toBuyerPdfSelections(row), code)` where it does not already; callers building from wizard state pass `bedroomFlooringChoice: selections.bedroomFlooringChoice, bedroomPremiumCarpetSelected: selections.premiumCarpetBedroom, bedroomPremiumUnderpadSelected: selections.premiumUnderpadBedroom`.
- Editor: two `Switch` controls under the bedroom carpet colour select, visible when `editData.bedroom_flooring_choice === 'carpet'`, bound to `premium_carpet_bedroom` and `premium_underpad_bedroom`; `updatePayload` writes both (currently absent).

- [ ] **Step 1: Write a test** `scripts/callers.test.ts` that reads `src/**/*.ts(x)` and `supabase/functions/**/*.ts` as text and asserts every file containing `computeUpgradeTotals(` or `computeUpgradeTotalsServer(` also contains `bedroomPremiumUnderpadSelected` or `totalsInputFromSelections(` (a source-grep guard, cheap and honest about the two-engine constraint).
- [ ] **Step 2: Run** `bun test scripts/callers.test.ts` — Expected: FAIL listing ~15 files.
- [ ] **Step 3: Update each call site**; prefer replacing hand-built inputs with `totalsInputFromSelections(toBuyerPdfSelections(row), code)` in client files, and the server equivalent object literal in edge functions.
- [ ] **Step 4: Add the two editor switches and `updatePayload` fields** in `SubmissionEditor.tsx`; price labels in the switch copy come from `useDynamicPricing` (`getMaterialCost('premium_carpet_underpad')`, markup) — no literals.
- [ ] **Step 5: Remove** the "Premium Carpet (Bedrooms) — Selected" / "Premium Underpad (Bedrooms) — Selected" rows at `buyerPdfGenerator.ts:405-406`; in the email CSV at `index.ts:112-113` print the amounts from `totals.pieces`.
- [ ] **Step 6: Run** `bun test` — Expected: PASS; run `bunx tsc --noEmit -p tsconfig.app.json` — Expected: 0 errors.
- [ ] **Step 7: Commit** `feat: thread bedroom premium inputs through all totals callers; editor toggles`.

---

### Task 5: Editor save integrity (heated floors, areaLabel, has_stairs gating)

**Files:**
- Modify: `src/components/admin/SubmissionEditor.tsx:194-197,226-235,284` and the stairs block (~`:600-660`)
- Test: `scripts/editor-payload.test.ts` (new) — extract the payload builder first.

**Interfaces:**
- Produces: `buildSubmissionUpdatePayload(editData: SubmissionEditState): TablesUpdate<'buyer_selections'>` exported from new `src/lib/submissionUpdatePayload.ts`, pure, used by `handleSave`. `SubmissionEditState` is the existing `editData` state type lifted out of `SubmissionEditor.tsx` (export it from the new module); `TablesUpdate` comes from `@/integrations/supabase/types`. Rules: `heated_floor_bathrooms = max(editData.heated_floor_bathrooms ?? 0, countOfAreaUpgradesWithHeatedFloor)` only when the editor exposed a heated-floor input; otherwise pass `editData.heated_floor_bathrooms` through unchanged. `area_upgrades` rows keep every existing key (`areaLabel` included) — spread `...upgrade` then normalise `manualPrice`/`heatedFloor`. The stair carpet/underpad switches render only when `editData.has_stairs` (they already live inside that block after `fa3141b`; assert it).

- [ ] **Step 1: Write failing tests**:
  - record with `heated_floor_bathrooms: 2`, no area heated → payload keeps `2` (Unit 37 shape, Review Focus #3)
  - area row with `areaLabel: 'Master Ensuite (incl. walk-in closet)'` → payload row retains `areaLabel`
  - `has_stairs: false` → payload `stair_premium_carpet_selected === false` regardless of input (existing rule, now tested)
- [ ] **Step 2: Run** — Expected: FAIL (module missing).
- [ ] **Step 3: Extract** the payload construction from `handleSave` into `buildSubmissionUpdatePayload`; fix the two rules; `handleSave` calls it.
- [ ] **Step 4: Run** `bun test` and `bunx tsc --noEmit -p tsconfig.app.json` — Expected: PASS / 0 errors.
- [ ] **Step 5: Commit** `fix(editor): preserve heated_floor_bathrooms and areaLabel on save`.

---

### Task 6: Missing editor inputs; dead components

**Files:**
- Modify: `src/components/admin/SubmissionEditor.tsx` (windows section; bathroom section; notes section)
- Modify: `src/lib/submissionUpdatePayload.ts` (from Task 5)
- Delete or wire: `src/components/admin/AdminNotesSection.tsx`, `src/components/admin/StatusWorkflowControl.tsx` (both unimported per audit)
- Test: `scripts/editor-payload.test.ts`

**Interfaces:**
- Editor exposes and payload writes: `automated_windows_qty` (number input beside patio doors, label `Motorized openings (Somfy)`), `custom_tiled_shower` (switch), `bathroom_tile_ensuite_selected` / `bathroom_tile_guest_selected` (two switches), `admin_notes` (textarea labelled `Internal notes (never printed for the buyer)`), `heated_floor_bathrooms` (number input labelled `Heated floors — bathrooms (count)`).
- Decision: wire `StatusWorkflowControl` into the submission detail header (it already implements the submitted→reviewed→quoted→completed flow and QBO auto-sync on `quoted`); delete `AdminNotesSection.tsx` (its single field is now in the editor).

- [ ] **Step 1: Extend tests** so the payload includes the six fields from `editData`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** inputs and payload mapping; mount `StatusWorkflowControl` in `AdminSubmissions.tsx` detail header; delete `AdminNotesSection.tsx`.
- [ ] **Step 4: Run** `bun test`, `bunx tsc --noEmit -p tsconfig.app.json`, `bun run build` — Expected: PASS / 0 / build OK.
- [ ] **Step 5: Commit** `feat(editor): expose motorized openings, shower, bathroom tile, heated floors, internal notes; wire status workflow`.

---

### Task 7: Client-visible vs internal comments on area upgrades

**Files:**
- Modify: `src/lib/upgradeCostData.ts:427-438` (`AreaUpgradeSelection` gains `clientComment?: string`)
- Modify: `src/components/admin/SubmissionEditor.tsx:860-865` (two inputs: `Client note (printed)` and `Internal note`)
- Modify: `src/lib/buyerPdfGenerator.ts:718-769`, `src/lib/submissionWordExport.ts` (Notes), `supabase/functions/send-selections-email/index.ts` buyer HTML "Your Comments" block
- Modify: `src/pages/SelectionWizard.tsx` area-upgrade comment input → writes `clientComment` (buyer-typed text is client-visible by definition)
- Test: `scripts/buyer-pdf-selections.test.ts`

**Interfaces:**
- Rule: buyer-facing renderers print `clientComment` only. `comments` (legacy field) is internal from now on and prints only when `staff = true`. Migration of existing data: a one-time SQL run by the executor, reported before running: `comments` → `clientComment` for all rows where the text was written by the buyer (the wizard is the only writer before 2026-11-16; after that staff typed into `comments`). Rule for the backfill: copy `comments` to `clientComment` for every area row whose submission `created_at < '2026-11-16'` **and** whose `submission_audit_logs` show no admin edit of `area_upgrades`; list the rest for Dan.

- [ ] **Step 1: Write failing test**: `toBuyerPdfSelections` + PDF notes mapper returns `clientComment` text and not `comments` text for an area row that has both.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** type, editor inputs, wizard write, three renderers (staff branch prints both, labelled).
- [ ] **Step 4: Run the backfill** per the rule above against the fixture first (assert parity unchanged — comments do not price), then against prod after reporting the list.
- [ ] **Step 5: Run** `bun test` — Expected: PASS.
- [ ] **Step 6: Commit** `feat: separate client-visible and internal notes on area upgrades`.

---

### Task 8: Live totals in the pricing panel; itemize-windows helper

**Files:**
- Modify: `src/components/admin/CustomPricingPanel.tsx` (props gain `selections: BuyerSelections`, `unitCode: string | null`, `pricing: UpgradeTotalsPricing`, `onSaveFirst: () => Promise<void>`)
- Modify: `src/components/admin/SubmissionEditor.tsx:962` (pass the props; expose `saveNow()`)
- Create: `src/lib/itemizeWindows.ts`
- Modify: `src/lib/upgradeTotals.ts` (`pieces.includedItems`), `src/lib/buyerPdfGenerator.ts`, `src/lib/submissionWordExport.ts` (render included items inside the Standard Selections table as `Included — $0.00`, not under "Not Included in Total")
- Test: `scripts/itemize-windows.test.ts` (new), `scripts/line-status.test.ts`

**Interfaces:**
- `itemizeWindows(selections: BuyerSelections, pricing: UpgradeTotalsPricing, locations: { additional: string[]; patio: string[]; motorized: string[]; includedBedrooms: { label: string; qty: number }[] }): { patch: Partial<BuyerSelections>; customItems: CustomLineItem[] }` — returns `additional_windows_qty: 0, patio_doors_qty: 0, automated_windows_qty: 0` in `patch` and one `CustomLineItem` per location with `quantity 1`, `unit 'each'`, `unitPrice` from `pricing.getAdditionalWindowPrice()` / `getPatioDoorPrice()` / `getAutomatedMotorPrice()`, `status 'upgrade'`, `label` = `Roller shade, 5% openness — <location>` / `Patio door panel track — <location>` / `Somfy motorization — <location>`, plus `status 'included'`, `unitPrice 0` lines for bedrooms labelled `Blackout roller shade — <bedroom>`. Idempotent: when all three quantities are already 0 it returns an empty `customItems` and an empty patch (Review Focus #4).
- Panel: a `Totals (live)` strip computed with `computeUpgradeTotals(totalsInputFromSelections({ ...selections, customPricing: value }, unitCode), pricing)` on every change; `Client preview` and `Word export` call `onSaveFirst()` then open.
- Engine: `pieces.includedItems: Array<{ label; detail?; area? }>` for `status === 'included'` custom items; they leave `uncommittedItems`.

- [ ] **Step 1: Write failing tests** for `itemizeWindows` (Unit 24 shape: 2 additional → 2 located lines at 673.50; 2 patio + 2 motorized → 4 lines; bedrooms → included lines; second call no-op) and for `pieces.includedItems` (an included item is not in `uncommittedItems`).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `itemizeWindows.ts`, engine `includedItems` (both engines), renderer placement, the panel's live totals strip and `Itemize windows by location…` button (a small dialog asking for the location names with defaults `Living Room`, `Front Entrance`, `Patio Door 1`, `Patio Door 2`, bedrooms from `Primary Bedroom`/`Second Bedroom`).
- [ ] **Step 4: Run** `bun test` — Expected: PASS; parity unchanged (helper is opt-in).
- [ ] **Step 5: Commit** `feat(panel): live totals, save-before-preview, itemize windows by location`.

---

### Task 9: Retire stale `window_total` reads

**Files:**
- Modify: `src/pages/AdminSubmissions.tsx:1218`, `src/lib/emailPreview.ts:90`, `src/lib/submissionPdfGenerator.ts:346`, `src/hooks/useDashboardData.ts:149`, `src/pages/AdminSalesAnalytics.tsx:105`, `supabase/functions/send-selections-email/index.ts:1414`
- Test: `scripts/callers.test.ts`

**Interfaces:**
- Every display of a window figure uses `totals.windowSubtotal` (pre-GST) from the engine; the email box that showed `window_total` "(incl. GST)" shows `windowSubtotal` and says `before GST`. The column stays in the DB (written at submit) but nothing reads it.

- [ ] **Step 1: Extend `callers.test.ts`**: assert no file under `src/` or `supabase/functions/` reads `window_total` except `send-selections-email/index.ts` insert and `buyerPdfSelections.ts` mapping.
- [ ] **Step 2: Run** — Expected: FAIL at 6 sites.
- [ ] **Step 3: Replace** each read.
- [ ] **Step 4: Run** `bun test`, `tsc` — Expected: PASS / 0.
- [ ] **Step 5: Commit** `refactor: window figures come from the engine, not the stale window_total column`.

---

### Task 10: Secure `send-selections-email`; recipients in settings

**Files:**
- Create: `drizzle/migrations/0005_portal_settings.sql` (+ `meta/_journal.json` entry, `meta/0005_snapshot.json`)
- Modify: `supabase/functions/send-selections-email/index.ts:537-560,713-760,1187`
- Modify: `supabase/config.toml` (`send-selections-email` → `verify_jwt = true`)
- Modify: `src/pages/SelectionWizard.tsx:~500` (send the user's access token, not the anon key, in `Authorization`)
- Create: `src/pages/AdminNotificationSettings.tsx` + route `/admin/settings/notifications`
- Test: `supabase/functions/send-selections-email/index.test.ts` (Deno test for the pure guard function)

**Interfaces:**
- Migration: `create table public.portal_settings (key text primary key, value jsonb not null, updated_at timestamptz default now(), updated_by uuid)`; RLS: admins select/insert/update; seed `('internal_notification_recipients', '["dan@bmdmaterials.com","noni@bmdmaterials.com","brian@bmdmaterials.com","office@bmdmaterials.com","gregor.mckenzie@nvc360.com"]')`.
- Function: new pure `authorizeSubmission(authHeader: string | null, bodyEmail: string, getUser: (jwt) => Promise<{ email: string } | null>): Promise<{ ok: true; email: string } | { ok: false; status: 401 | 403 }>` — 401 when no/invalid JWT, 403 when `lower(user.email) !== lower(bodyEmail)` unless the user has `admin` role (admins may submit on behalf). `preview`/`test` actions remain admin-only (they already are via the UI; enforce admin here too).
- Insert failure → respond `500 { error: 'save_failed' }` and send **no** emails; client keeps the draft and shows the error (Review Focus #5).
- Recipients read from `portal_settings` at request time; fallback to the seed list only if the row is missing.

- [ ] **Step 1: Write Deno tests** for `authorizeSubmission` (no header → 401; mismatched email → 403; match → ok; admin mismatch → ok).
- [ ] **Step 2: Run** `deno test supabase/functions/send-selections-email/` — Expected: FAIL.
- [ ] **Step 3: Implement** guard, reorder insert-before-email with early return on error, recipients lookup, config change, migration, settings page (admin-only, list editor), wizard header change (`supabase.auth.getSession()` → `Bearer ${session.access_token}`).
- [ ] **Step 3b: `verify_jwt` sweep** (spec §6.14): set `verify_jwt = true` in `supabase/config.toml` for `sync-hubspot`, `setup-hubspot-properties`, `resend-confirmation-email`, `audit-pricing-consistency`, `send-user-notification`. Before touching `send-draft-reminder`, run `select * from cron.job` (pg_cron) and check Lovable/Supabase scheduled functions; if it is invoked on a schedule without a JWT, leave it and add the `x-internal-secret` check used by `qbo-sync-submission/index.ts` instead. Internal fan-out calls already send the service-role key as a Bearer token (`send-selections-email/index.ts:772-776`), which passes `verify_jwt`.
- [ ] **Step 4: Run** Deno tests, `bun test`, `tsc` — Expected: PASS. Manual check in Lovable preview: submit a test selection as a buyer; confirm 200 and both emails; call the function with the anon key only → 401.
- [ ] **Step 5: Commit** `fix(security): require buyer JWT on submission, fail loudly on save errors, recipients in portal_settings`.

---

### Task 11: Buyer-facing label fixes (pre-Phase-2)

**Files:**
- Modify: `src/lib/buyerPdfGenerator.ts:369-372,405-407`, `supabase/functions/send-selections-email/index.ts:1315,1340`, CSV `:68-72,:113`, `src/lib/submissionWordExport.ts` Selections rows
- Test: `scripts/buyer-pdf-selections.test.ts`

**Interfaces:**
- Labels (exact copy): `Bathroom Tile` (never `Bathroom/Laundry Tile`; laundry appears as its own row `Laundry Room` with `Luxury Vinyl Plank (standard)` or the upgraded material when an `area_upgrades.laundry` row exists); `Primary Bedroom Flooring`; `Primary Bedroom Carpet Colour`; `Stair Flooring – Carpet` with `Standard Carpet (Included)` when `has_stairs` and no stair upgrade. Word export uses `resolveOptionName` for colours instead of raw ids.

- [ ] **Step 1: Write failing tests** asserting the exact labels above for a Type C record with a laundry LVP row and a carpet primary bedroom.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** in the four renderers.
- [ ] **Step 4: Run** `bun test` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(output): base-spec wording — Primary Bedroom, laundry row, stair carpet line`.

---

### Task 12: Ship — AGENTS.md rule, Lovable knowledge, publish, acceptance

**Files:**
- Modify: `AGENTS.md` (append spec §12 P1 rule verbatim)
- Modify: `docs/superpowers/specs/2026-11-18-quote-lines-redesign-design.md` (§8 Phase 1 items marked done with commit SHAs)

- [ ] **Step 1: Append the P1 rule** to `AGENTS.md`: "Bedroom premium carpet/underpad and stair carpet/underpad are priced by the engines via override keys `bedroomCarpet`, `bedroomUnderpad`, `stairCarpet`, `stairUnderpad`; editor toggles must exist for every priced flag."
- [ ] **Step 2: Set Lovable project knowledge** (via `set_project_knowledge`) to: "Follow AGENTS.md. Pricing engines (`src/lib/upgradeTotals.ts`, `supabase/functions/_shared/upgradeTotalsServer.ts`) and renderers are frozen pending the quote-lines migration; make UI-only changes unless Dan asks otherwise. Run `bun test` before committing."
- [ ] **Step 3: Full verification**: `git pull --rebase origin main && bun test && bunx tsc --noEmit -p tsconfig.app.json && bun run build` — Expected: all green.
- [ ] **Step 4: Push** `git -c push.negotiate=true push origin main`; message Dan to click **Publish** in Lovable and apply migration 0005 (Lovable applies `drizzle/migrations` on sync; confirm `portal_settings` exists with `select * from portal_settings`).
- [ ] **Step 5: Acceptance walkthrough with Noni** on a test unit (clone Unit 7's shape as a draft record): add Primary Bedroom underpad and lower-stair carpet + pad in under 60 s; totals change before save; Client preview shows no internal text; buyer PDF prints `Pending` for a pending line. Record the result in the spec §8 Phase 1 acceptance line.
- [ ] **Step 6: Commit** `docs: Phase 1 shipped — AGENTS.md rule, spec status`.
