# Phase 2 — Quote Lines, Meeting Console, Running Total Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `quote_lines` the system of record for everything priced on a unit, give staff a one-screen quote workspace with an always-visible running total (also shown to buyers in the wizard and on a review page), and cut every output over to lines — with the harness proving identical totals on all 9 live units before the old engines are deleted.

**Architecture:** One dependency-free line generator (`supabase/functions/_shared/quoteLines.ts`) runs in the browser, in edge functions and in tests; the wizard generates lines from in-progress selections, the submission inserts them, staff edit them in the console, and every renderer sums `amount WHERE counts_in_total` + GST. Phase 1's two engines stay green behind a parity test until the last task removes them. Pricing requests are `pending` lines with `flagged_to`; notifications go out through Teams Workflows with Resend fallback. Snapshots freeze a quote for sending/signing (SignWell behind an `EsignProvider` interface) and signed PDFs land in private storage.

**Tech Stack:** Vite + React 18 + TypeScript + shadcn/ui + TanStack Query; Supabase Postgres (RLS, triggers, Realtime), Deno edge functions; `bun test` (bun:test, relative imports) and `deno test`; drizzle migrations under `drizzle/migrations/` (applied via the Lovable DB connection + journal insert per the Phase 1 runbook); GitHub Actions for the daily digest cron (prod has no pg_cron).

**Spec:** `docs/superpowers/specs/2026-11-18-quote-lines-redesign-design.md` — §6.1–6.11, §6.14–6.16, §8 Phase 2, §11, §12 P2 rule. Phase 1 facts: `docs/superpowers/plans/2026-11-18-phase1-relief-for-noni.md`, `AGENTS.md`.

## Global Constraints

- Binding Phase 2 AGENTS rule (spec §12 P2), to be appended in Task 18: "`quote_lines` is the system of record for anything priced, included, pending or deferred. Nothing outside `generateQuoteLines` and the console may write a price. Renderers read lines; totals are `SUM(amount) WHERE counts_in_total` + GST."
- Parity: for every fixture submission in `scripts/fixtures/live-submissions.json`, `SUM(amount) WHERE counts_in_total` over generated lines **equals `computeUpgradeTotals(...).grandSubtotal` to the cent** (`toFixed(2)` equality), and the pinned subtotals in `scripts/parity.test.ts` never change: `'2':2460, '4':14334, '7':3296.7, '24':10388.4, '27':0, '31':27263, '37':10488.5, '38':2680.5, '43':23865`. Markup 0.6, GST 0.05, from `pricing_config` only — no hardcoded prices anywhere new.
- `generateQuoteLines` is pure, dependency-free (no imports), ESM, identical bytes for browser/Deno; the canonical file is `supabase/functions/_shared/quoteLines.ts`, imported by the app through the alias `@shared/*` (Task 3).
- Status vocabulary for lines: `included | upgrade | pending | under_review | deferred | removed`. `counts_in_total` ⇔ `status = 'upgrade' AND amount IS NOT NULL`. Pending prints "Pending", never $0. `under_review`/`deferred` print under "Not included in total". `removed` hidden everywhere except audit.
- Buyer-visible output reads only `client_visible = true` lines and `client_note`; `internal_note`, `sales_comments`, `admin_notes` never reach a buyer renderer or an AI prompt (AGENTS rule 3; spec P3 rule applies early).
- Labels (exact): `Primary Bedroom`, `Bathroom Tile`, `Laundry Room`, `Stair Flooring – Carpet` (en dash), `Stairs to Lower Level`, `Included — $0.00`, `Not included in total`, `Pending`. Running-total rows: `Upgrades`, `Window coverings`, `Subtotal`, `GST 5%`, `Total`.
- Roles: `staff` may read all submissions, edit lines, create pending lines, upload documents, send for signature; may not change `pricing_config`/`upgrade_materials`, manage users, or connect QBO. `admin` keeps everything.
- Every edge function keeps the Phase 1 gating (`_shared/internalAuth.ts`, `authorizeSubmission.ts`); new functions use the same helpers. Deno `check`/`test` must pass on edited functions.
- Autosave: debounce 500 ms per row, in-flight dedupe, "Saved ✓ hh:mm:ss" / "Saving…" / "Save failed — retry" in the rail; no silent data loss on navigation (beforeunload guard while dirty).
- Commit author "Dan Rosenblat (via Claude)" <dan@bmdmaterials.com>; trailers `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_012aGVhGKMoXTqT2UNjnSqDt`.

## Review Focus

1. A staff member changes a line's quantity and immediately clicks "Client preview" — the preview must reflect the change (flush pending autosave first) and the rail total must equal the PDF total. (Task 8 test: `console-flush.test.ts`.)
2. A line is set to `pending` with no amount — nowhere may "$0.00" appear for it: rail, console, PDF, Word, email, buyer page. (Task 4/10/11 tests assert the literal `Pending`.)
3. Two staff edit the same quote: the second save must not overwrite the first's other fields — row-level updates only, `updated_at` optimistic check with a "Reloaded — someone else edited this line" toast. (Task 6 test: `quote-lines-hook.test.ts` conflict case.)
4. A buyer opens `/my-quote` from a different email than the submission (hotmail vs gmail) — "No quote found for this sign-in" with the office contact, never another buyer's quote. (Task 13 RLS test.)
5. Backfill run twice — must be idempotent: no duplicate `migration` lines; rerun reports 0 writes. (Task 5 test.)

---

### Task 1: Schema — `quote_lines`, `unit_base_spec`, snapshots, documents, reviews, `staff` role

**Files:**
- Create: `drizzle/migrations/0006_quote_lines.sql`, `drizzle/migrations/meta/0006_snapshot.json` (`tables: {}` like 0005), `_journal.json` entry
- Modify: `src/integrations/supabase/types.ts` (hand-add the new tables/enum in the same shape; regenerate later when Lovable syncs)
- Test: `scripts/migration-0006.test.ts`

**Interfaces:**
- Produces tables exactly per spec §6.1 (`quote_lines`), §6.2 (`unit_base_spec`), §6.7 (`quote_line_reviews`), §6.8 (`quote_snapshots`, `documents`), plus: `ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'staff'`; view `pricing_queue` (spec §6.5: open `pending` lines with `flagged_to`, joined to submission unit/buyer and `profiles` assignee, `age_hours`); trigger `quote_lines_audit` writing to `submission_audit_logs` on insert/update/delete (`changes` = old/new diff, `actor` = `auth.uid()`); `counts_in_total boolean GENERATED ALWAYS AS (status = 'upgrade' AND amount IS NOT NULL) STORED`; storage bucket `unit-documents` (private).
- RLS: staff/admin full on `quote_lines`, `quote_snapshots`, `documents`, `unit_base_spec` (write admin-only); buyers `SELECT` on `quote_lines` where `client_visible` and the parent submission's `email = lower(auth.jwt()->>'email')`; buyers insert/select own `quote_line_reviews`. Predicate helper: `public.is_staff(uid) := has_role(uid,'admin') OR has_role(uid,'staff')`.
- `guard_custom_pricing` trigger updated to accept `is_staff`.

- [ ] **Step 1: Write `scripts/migration-0006.test.ts`** — parses the SQL file and asserts: every table/column name from spec §6.1 is present; `counts_in_total` is a generated column; `'staff'` enum value added; `pricing_queue` view exists; every new table has `ENABLE ROW LEVEL SECURITY`; the journal has a `0006_quote_lines` entry with `idx: 6`.
- [ ] **Step 2: Run** `bun test scripts/migration-0006.test.ts` — FAIL (file missing).
- [ ] **Step 3: Write the migration** (style of 0005; `IF NOT EXISTS` everywhere; policies named `"Staff manage quote lines"` etc.; `is_staff` function `SECURITY DEFINER STABLE`).
- [ ] **Step 4: Validate SQL** — parse every statement with `pgsql-ast-parser` (`scripts/lib/parseSql.ts`, run under bun) and assert zero parse errors; no live database is touched by tests.
- [ ] **Step 5: Run** test — PASS. `bunx tsc --noEmit -p tsconfig.app.json` clean after the types edit.
- [ ] **Step 6: Commit** `feat(schema): quote_lines, unit_base_spec, snapshots, documents, reviews, staff role (migration 0006)`.

---

### Task 2: Seed `unit_base_spec` from the Base Specifications

**Files:**
- Create: `drizzle/migrations/0007_seed_unit_base_spec.sql` (+ journal/snapshot), `src/lib/baseSpec.ts` (the same rows as a typed constant for the wizard/tests), `scripts/base-spec.test.ts`
- Reference: project doc *Glendale Base Specifications*; `unit_area_data` rows (types A…J, `-2` rows for G/H) for which locations exist per type.

**Interfaces:**
- Produces: `BASE_SPEC: BaseSpecRow[]` with `{ unitTypeCode, section, location, label, defaultProduct, defaultColourOptions: string[], isIncluded }`; `baseSpecFor(unitTypeCode): BaseSpecRow[]`.
- Rows per type: main living LVP (XL Flooring, colours Cortland/Opal/Wolf River); each washroom present in `unit_area_data` → Dante 2.0 (Pezzo/Piccolo/Venatino); laundry → **Ceratec Dante 2.0 LVT (Dan, 2026-11-18 17:00 CT; constant `LAUNDRY_DEFAULT_PRODUCT`, same wording as `LAUNDRY_STANDARD_LABEL` in `src/lib/outputLabels.ts`)**; Primary Bedroom + second bedroom → "LVP or Luxor I carpet + standard underpad" (colours Winterbrooke 898, Midnight Shadow 427, Jet Stream 200, Sawgrass 701); stairs 1st→2nd where the type has them; "Stairs to Lower Level" carpet + pad in every type; kitchen backsplash 3×8 subway; bedroom windows → Graber blackout shade included, one per bedroom; basement → `isIncluded=false`, label "Unfinished — pricing not released".

- [ ] **Step 1: Test** `base-spec.test.ts`: every `unit_type_code` in `scripts/fixtures/pricing-snapshot.json` has ≥ 8 rows; Type C has exactly one "Primary Bedroom" row and one "Stairs to Lower Level" row; no row has an empty label; the SQL seed row count equals `BASE_SPEC.length` (generate the SQL from the constant with `scripts/gen-base-spec-sql.ts` and assert the file is in sync).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** constant + generator + migration. **Step 4: Run** — PASS. **Step 5: Commit** `feat(data): seed unit_base_spec per unit type`.

---

### Task 3: `generateQuoteLines` — pure generator with engine parity

**Files:**
- Create: `supabase/functions/_shared/quoteLines.ts`, `src/lib/quoteLines.ts` (re-export via alias), `scripts/quote-lines-parity.test.ts`, `scripts/quote-lines-cases.test.ts`
- Modify: `vite.config.ts`, `tsconfig.app.json` (`paths: { "@shared/*": ["./supabase/functions/_shared/*"] }`), `supabase/functions/_shared/upgradeTotalsServer.ts` untouched.

**Interfaces:**
- `export interface QuoteLine { id?: string; submission_id?: string; sort_order: number; section: Section; location: string; label: string; product_name?: string | null; product_colour?: string | null; material_key?: string | null; quantity?: number | null; unit: 'sqft'|'sqyd'|'each'|'flat'; unit_price?: number | null; amount?: number | null; pricing_mode: 'catalog'|'flat_rate'|'manual'|'included'; price_source_ref?: string | null; status: LineStatus; client_visible: boolean; client_note?: string | null; internal_note?: string | null; source: 'wizard'|'office'|'buyer_request'|'migration'; flagged_to?: string | null; provisional: boolean; wizard_field?: string | null }`
- `export function generateQuoteLines(input: GenerateInput): QuoteLine[]` where `GenerateInput = { selections: BuyerPdfSelections-shaped record (the Phase 1 `totalsInputFromSelections` input plus windows/colours), unitTypeCode, pricing: ServerPricing (from `loadServerPricing` shape), unitAreas, baseSpec: BaseSpecRow[], customPricing?: CustomPricing }`.
- `export function sumQuoteLines(lines: QuoteLine[], gstRate: number): { upgrades: number; windowCoverings: number; subtotal: number; gst: number; total: number; notInTotal: QuoteLine[] }` — window coverings = lines in section `window_coverings`.
- Line order/labels mirror the engine's `lineItems` so parity can be checked line-for-line: for each engine line item there is exactly one generated line with equal `amount` (within 0.005) and `counts_in_total`.
- Custom items from `custom_pricing.customItems` map to lines (`source: 'office'`, status mapped `disputed → under_review`); overrides become `pricing_mode: 'manual'` lines with `price_source_ref: 'override:<key>'`.

- [ ] **Step 1: Write `quote-lines-parity.test.ts`**: for each of the 9 fixtures, `sumQuoteLines(generateQuoteLines(...), 0.05).subtotal.toFixed(2) === computeUpgradeTotals(...).grandSubtotal.toFixed(2)` AND `computeUpgradeTotalsServer` agrees AND line-for-line amounts match `lineItems`. Expected pins copied verbatim from `scripts/parity.test.ts`.
- [ ] **Step 2: Write `quote-lines-cases.test.ts`**: Type C carpet bedroom + premium underpad → one line `Primary Bedroom / Premium underpad / 44 sqyd / 9.60 / 422.40`; pending custom item → `amount null, status pending`; included shade → `status included, amount 0, client_visible true`; `removed` never emitted; laundry row uses `LAUNDRY_DEFAULT_PRODUCT`; G-2 bedroom sqyd rule.
- [ ] **Step 3: Run** both — FAIL. **Step 4: Implement** the generator (no imports; copy needed constants). **Step 5: Run** — PASS; `deno check supabase/functions/_shared/quoteLines.ts`; `tsc`; `bun run build` (alias resolves). **Step 6: Commit** `feat(lines): generateQuoteLines with cent-exact engine parity on all 9 units`.

---

### Task 4: `RunningTotal` rail component

**Files:**
- Create: `src/components/quote/RunningTotal.tsx`, `src/components/quote/runningTotalModel.ts` (pure: lines → view model), `scripts/running-total-model.test.ts`
- Test: component smoke via `scripts/running-total-render.test.ts` using `react-dom/server` `renderToStaticMarkup` (no DOM lib needed).

**Interfaces:**
- `buildRunningTotalModel(lines: QuoteLine[], gstRate: number, opts: { buyerView: boolean }): { counted: Array<{ key, location, label, amount }>; notInTotal: Array<{ key, location, label, amountText: string /* "$1,005.00" | "Pending" */, statusLabel }>; rows: Array<{ label: 'Upgrades'|'Window coverings'|'Subtotal'|'GST 5%'|'Total'; amount }> }` — `buyerView` drops `client_visible=false` lines.
- `<RunningTotal lines gstRate buyerView saveState={{ status: 'saved'|'saving'|'error'|'idle', at?: Date }} onRetry? />` — desktop: sticky `aside` 320 px; `< lg`: fixed bottom bar showing Total with a toggle to expand (shadcn `Sheet`).

- [ ] **Step 1: Tests**: model for Unit 24 fixture lines → Total `10,907.82`; pending line renders `Pending` not `$0.00`; buyerView hides an internal line; rows order fixed; render test asserts the strings `Upgrades`, `GST 5%`, `Total`, `Saved ✓`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit** `feat(ui): RunningTotal rail`.

---

### Task 5: Backfill + harness mode

**Files:**
- Create: `scripts/backfill-quote-lines.ts` (prints a per-unit parity report; `--write` inserts `source='migration'` lines; idempotent: skips submissions that already have any lines), `scripts/backfill-quote-lines.test.ts`
- Modify: `supabase/functions/audit-pricing-consistency/index.ts` (new `mode: 'lines'`: engine totals ↔ `SUM(quote_lines)` per submission, returns diffs), `scripts/fixtures/` (add `quote-lines-expected.json` generated once and pinned)

- [ ] **Step 1: Tests**: dry run over fixtures lists 9 units with `parity: ok`; running `--write` twice against an in-memory stub inserts once (Review Focus 5); a fixture with a deliberately altered amount reports `parity: FAIL` and is excluded from writes.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; `deno check` audit function. **Step 5: Commit** `feat(migration): quote_lines backfill with per-unit parity report; harness lines mode`.
- Controller runs the dry run against prod after Task 1/2 migrations are applied and brings the report to Dan; `--write` only after sign-off.

---

### Task 6: Line data layer — `useQuoteLines` with autosave and conflict handling

**Files:**
- Create: `src/hooks/useQuoteLines.ts`, `src/lib/quoteLinesApi.ts` (pure request builders), `scripts/quote-lines-api.test.ts`, `scripts/quote-lines-hook.test.ts` (hook logic extracted into a pure reducer `quoteLinesReducer`)

**Interfaces:**
- `useQuoteLines(submissionId): { lines, upsert(line), remove(id) /* sets status removed */, reorder(ids), saveState, flush(): Promise<void>, refresh() }` — optimistic reducer; 500 ms debounce per line id; `flush()` awaits all pending; conflict: update uses `.eq('updated_at', knownUpdatedAt)`; zero rows → refetch that line, toast `Reloaded — someone else edited this line`.
- Realtime subscription on `quote_lines` filtered by `submission_id` merges remote changes not originating from this tab.

- [ ] **Step 1: Tests**: reducer: optimistic upsert then server ack; debounce coalesces 3 edits into 1 request (fake timers); conflict path refetches and preserves the other user's field (Review Focus 3); `remove` sets `status: 'removed'` rather than deleting.
- [ ] **Step 2–5:** RED → implement → GREEN → commit `feat(lines): useQuoteLines with autosave, flush and conflict reload`.

---

### Task 7: Quotes list `/admin/quotes`

**Files:**
- Create: `src/pages/AdminQuotes.tsx`, `src/lib/quoteSearch.ts` (pure filter/rank), `scripts/quote-search.test.ts`
- Modify: `src/App.tsx` (routes `/admin/quotes`, `/admin/quotes/:id`, redirect `/admin/submissions/:id/console` → `/admin/quotes/:id`), admin nav (add "Quotes" first), `src/pages/AdminSubmissions.tsx` (row action "Open quote" → `/admin/quotes/:id`; keep View for the read-only summary).

**Interfaces:** `rankQuotes(rows, query): rows` — matches unit number exact first, then last-name prefix, then email contains; empty query → recent (localStorage `recentQuotes` list of ids, max 8) then by `updated_at desc`. Status chips filter `buyer_selections.status`.

- [ ] **Step 1: Tests**: `rankQuotes` ordering cases; empty query returns recents first.
- [ ] **Step 2–5:** RED → implement (search input autofocus; results as you type; Enter opens first) → GREEN → commit `feat(admin): Quotes list with search-first entry to the console`.

---

### Task 8: Meeting console `/admin/quotes/:id`

**Files:**
- Create: `src/pages/QuoteConsole.tsx`, `src/components/quote/{LineRow,SectionGroup,AddLineMenu,StatusSelect,NotesPanels,ConsoleHeader}.tsx`, `src/lib/addLinePresets.ts` (catalog preset → material/unit/unit_price from Pricing Control; flat rate → `pricing_config` key; never hardcoded), `scripts/add-line-presets.test.ts`, `scripts/console-flush.test.ts`
- Modify: `src/components/admin/SubmissionEditor.tsx` (open in a `Dialog` from "Edit buyer details"; buyer-identity + raw wizard fields only), `src/components/admin/CustomPricingPanel.tsx` (retire; keep until Task 18 behind the legacy Submissions View)

**Interfaces:** layout per spec §6.10 with `RunningTotal` as the right rail (Task 4) replacing the bottom strip; sections in spec order; row inline edit (label, product/colour, qty, unit price, status, visible, flag-to, client note, internal note); "Request pricing" creates `status: pending` + flag-to picker; status → `under_review`/`deferred` prompts for `client_note` reason; header buttons: Client preview, Word, PDF (Phase 1 renderers until Task 10 — they call `flush()` first), Send for signature (disabled until Task 14), Edit buyer details. Keyboard: Tab/Enter moves across cells; `⌘/Ctrl+S` flushes. Works at 1024×768 landscape.

- [ ] **Step 1: Tests**: presets resolve prices from a pricing fixture (no literals); `console-flush` — clicking preview with a dirty row calls `flush()` before the renderer (Review Focus 1); status change to `under_review` without a reason is rejected.
- [ ] **Step 2–5:** RED → implement → GREEN → commit `feat(console): one-screen quote workspace with running total`.

---

### Task 9: Wizard — running total and located windows; submission writes lines

**Files:**
- Modify: `src/pages/SelectionWizard.tsx` (rail from first priced step; lines = `generateQuoteLines` over in-progress selections; Windows step collects windows by location from `baseSpecFor(type)` presets with "Add another"; submit body carries `lines`), `src/components/StepContainer.tsx` (two-column shell ≥ lg), `supabase/functions/send-selections-email/index.ts` (after the submission insert: regenerate lines server-side from the saved row with `generateQuoteLines` and insert them `source='wizard'`; ignore client `lines` except for a parity log line), `scripts/wizard-lines.test.ts`
- Keep the three integer columns written for Phase 1 renderers until Task 11.

- [ ] **Step 1: Tests**: wizard selections → lines include one `window_coverings` line per located window with `unit_price` from pricing; included bedroom shades present at $0; the server-side regeneration from the inserted row equals the client lines (fixture round-trip).
- [ ] **Step 2–5:** RED → implement → GREEN (`deno check`) → commit `feat(wizard): running total rail, windows by location, lines written at submit`.

---

### Task 10: Renderer cutover 1 — buyer PDF and Word read lines

**Files:**
- Modify: `src/lib/buyerPdfGenerator.ts`, `src/lib/submissionWordExport.ts`, `src/lib/buyerPdfSelections.ts` (add `loadQuoteLines(submissionId)` to `loadSavedSubmissionContext`), tests `scripts/buyer-pdf-selections.test.ts`, `scripts/buyer-pdf-upgrade-rows.test.ts`, new `scripts/renderer-lines-parity.test.ts`

**Interfaces:** six columns everywhere: location · item · product/colour · qty · unit price · amount · status; "Standard selections" = `status included`; "Premium upgrades" = counted lines; "Not included in total" = under_review/deferred (+ pending as "Pending"); staff copy appends `internal_note` block. Totals from `sumQuoteLines` only.

- [ ] **Step 1: Tests**: for each fixture, rendering from `generateQuoteLines` output yields section subtotal == engine `upgradesSubtotal` and Total == engine `grandTotal` (harness before/after); pending shows `Pending`; buyer copy contains no `internal_note` text.
- [ ] **Step 2–5:** RED → implement → GREEN → commit `feat(output): PDF and Word read quote_lines`.

---

### Task 11: Renderer cutover 2 — emails, CSV/exports, PM hub, HubSpot/QBO values

**Files:**
- Modify: `supabase/functions/send-selections-email/index.ts`, `resend-confirmation-email/index.ts` (tables from lines; `_shared/quoteLines.ts` `sumQuoteLines`), `src/lib/submissionExportBuilder.ts`, `src/lib/submissionFlatExport.ts`, `src/lib/projectManagementData.ts` + `submissionLineItems.ts` (canonical lines keyed by `quote_line_id`), `supabase/functions/sync-hubspot/index.ts` (window value = `sumQuoteLines().windowCoverings`), `src/lib/emailPreview.ts`
- Tests: extend edge-string tests; `scripts/exports-lines.test.ts`.

- [ ] **Step 1: Tests**: email HTML built from fixture lines contains six-column header and `Pending`; CSV upgrade columns sum to engine subtotal; PM canonical lines carry `quote_line_id`.
- [ ] **Step 2–5:** RED → implement → GREEN (`deno check`) → commit `feat(output): emails, exports, PM and HubSpot read quote_lines`.

---

### Task 12: Pricing queue, notifications, settings

**Files:**
- Create: `src/pages/AdminPricingQueue.tsx` (`/admin/pricing-queue`, grouped by assignee, age, inline answer: unit price/amount/status → audit), nav badge via Realtime count; `supabase/functions/notify-pricing-request/index.ts` (DB webhook on `quote_lines` insert/update where `flagged_to` changed → Teams Workflows Adaptive Card; on POST failure or `age > escalation_hours` → Resend email to assignee); `supabase/functions/pricing-digest/index.ts` (daily open-pending digest to Dan + Brian; gated by `x-internal-secret`); `.github/workflows/pricing-digest.yml` (cron `0 14 * * *` UTC = 08:00 CT, secret `SUPABASE_SERVICE_ROLE_KEY`); migration `0008_portal_settings_notifications.sql` (keys `teams_webhook_url`, `pricing_escalation_hours` default 4, `pricing_digest_recipients`)
- Modify: `src/pages/AdminNotificationSettings.tsx` (webhook URL, escalation hours, digest recipients, "Send test card" button)
- Tests: `supabase/functions/_shared/adaptiveCard.ts` pure builder + Deno/bun tests; `scripts/pricing-queue.test.ts` for the queue view model.

- [ ] **Step 1: Tests**: card JSON has unit/buyer/location/label/note and a deep link `/admin/quotes/:id#line-:lineId`; escalation picks lines older than N hours; digest groups by assignee.
- [ ] **Step 2–5:** RED → implement → GREEN → commit `feat(queue): pricing queue, Teams/Resend notifications, digest cron, settings`.
- Needs from Dan: Teams Workflows webhook URL (stored in `portal_settings`, never in code).

---

### Task 13: Buyer review page `/my-quote`

**Files:**
- Create: `src/pages/MyQuote.tsx` (RLS-scoped lines, grouped by section, six columns, `RunningTotal buyerView`, per-line Accept/Question/Comment → `quote_line_reviews`, "Request a change" → `buyer_request` pending line flagged to the unit's rep, Download Word/PDF from lines), `scripts/my-quote-model.test.ts`
- Modify: `src/App.tsx` (route, buyer `ProtectedRoute`), buyer confirmation email (link to `/my-quote`), console (latest buyer response per line shown in a column; Review Focus 4 message when no quote matches)

- [ ] **Step 1: Tests**: model hides internal lines; latest response per line wins; email-mismatch state renders the office contact string.
- [ ] **Step 2–5:** RED → implement → GREEN → commit `feat(buyer): /my-quote review page with running total and line responses`.

---

### Task 14: Snapshots, documents, e-sign (SignWell)

**Files:**
- Create: `supabase/functions/_shared/esign/{provider.ts (EsignProvider interface), signwell.ts}`, `supabase/functions/send-for-signature/index.ts` (staff JWT → creates the snapshot row → creates the provider document from a PDF the console has just rendered from that snapshot and uploaded to `unit-documents/` (the PDF renderer is browser-side) → returns the embedded-signing URL), `supabase/functions/esign-webhook/index.ts` (signature-verified; marks `signed`, downloads signed PDF to `unit-documents/{unit}/{document_id}.pdf`, audit, advances status per settings), `src/components/quote/DocumentsPanel.tsx` (list, upload external PDF, send for signature, embedded signing dialog), migration `0009_esign_settings.sql` (`esign_provider`, `esign_status_after_signed`)
- Tests: provider interface contract test with a fake provider; webhook signature verification test; snapshot immutability test (`version` increments, rows never updated).

- [ ] **Step 1: Tests** as above plus "Send for signature" refuses when any counted line is `pending`.
- [ ] **Step 2–5:** RED → implement → GREEN (`deno check`) → commit `feat(esign): snapshots, documents, SignWell send-for-signature and webhook`.
- Needs from Dan: SignWell API key + webhook secret as edge secrets (`SIGNWELL_API_KEY`, `SIGNWELL_WEBHOOK_SECRET`).

---

### Task 15: QuickBooks estimate from lines

**Files:**
- Modify: `supabase/functions/qbo-sync-submission/index.ts` (lines 1:1 → estimate lines; SKU `GLEN-{section}-{material_key|slug}`; `auto_create_items`; totals via `sumQuoteLines`; refuse when any counted line pending), `src/pages/AdminQuickBooksSettings.tsx` (reconnect banner when refresh token expired — it is, since 2026-08-15)
- Tests: `scripts/qbo-lines-map.test.ts` (pure mapper: SKU scheme, amounts equal line amounts, GST line).

- [ ] **Step 1–5:** RED → implement → GREEN → commit `feat(qbo): estimate built from quote_lines`.

---

### Task 16: `staff` role end to end

**Files:**
- Modify: `src/hooks/useAuth.ts`/`ProtectedRoute` (`isStaff`), admin nav (hide Pricing Control, Users, QuickBooks for staff), `src/pages/AdminUsers.tsx` (assign `staff`), RLS already in Task 1; `supabase/functions/_shared/internalAuth.ts` (`authorizeStaffOrAdmin` for line-editing functions), migration `0010_noni_staff.sql` (insert `user_roles` row for Noni's user id — looked up by email in the migration)
- Tests: `scripts/role-gating.test.ts` (pure nav/permission map).

- [ ] **Step 1–5:** RED → implement → GREEN → commit `feat(roles): staff role; Noni → staff`.

---

### Task 17: AI hardening (spec §6.15)

**Files:** `supabase/functions/summarize-upgrade-requests/index.ts` (delimit untrusted text, strip URLs/HTML, pin model id, token log to `user_activity_logs`), `supabase/functions/_shared/promptSafety.ts` + tests with an injected instruction fixture; 5 golden fixtures in `scripts/fixtures/ai-golden/`.

- [ ] **Step 1–5:** RED → implement → GREEN → commit `fix(ai): untrusted-text delimiting, pinned model, token logging`.

---

### Task 18: Cutover complete — delete the old engines, docs, ship

**Files:**
- Delete: `src/lib/upgradeTotals.ts` compute path, `supabase/functions/_shared/upgradeTotalsServer.ts`, `src/lib/pricingFromDynamic.ts`, `useWindowSubtotal.ts`, `CustomPricingPanel.tsx`, `custom_pricing` writers (column kept read-only for audit); update `scripts/callers.test.ts` guard to forbid any import of the deleted modules and any arithmetic on prices outside `_shared/quoteLines.ts`; `scripts/parity.test.ts` becomes lines-only (same pins).
- Modify: `AGENTS.md` (append P2 rule verbatim; Phase 2 module map), spec §8 (Phase 2 items done with SHAs; acceptance status), project doc *Phase 1 Status & Deploy Runbook* → add Phase 2 deploy section (migrations 0006–0010 via DB connection + journal; functions list; GitHub Actions secret; Lovable deploy-only message), Lovable project knowledge updated.
- Verification: `bun test`, `deno test`, `tsc`, `bun run build`; prod harness `mode: 'lines'` shows 0 diffs on all 9 units; Unit 24 scripted walkthrough (Mike's 12 corrections) performed in the console on a copy of Unit 24 and recorded.

- [ ] **Step 1: Run the deletion** and make the guard test the only thing that fails first, then fix callers. **Step 2:** full gates. **Step 3:** commit `chore: remove Phase 1 engines; quote_lines is the system of record`. **Step 4:** docs commit `docs: Phase 2 shipped`. **Step 5:** PR to `main` for Dan; deploy per runbook; walkthrough.

---

## Dependencies

1 → 2 → 3 → 4 → 5 (backfill needs 1–3; prod dry run needs 1–2 applied) · 6 after 1, 3 · 7 after 6 · 8 after 4, 6, 7 · 9 after 3, 4 (+2 for window presets) · 10 after 5 (prod lines exist) · 11 after 10 · 12 after 6, 8 · 13 after 10 · 14 after 13 · 15 after 10 · 16 after 1 (can run any time after) · 17 independent · 18 last.

## Inputs needed from Dan (do not block; defaults recorded)

Teams Workflows webhook URL (Task 12). · SignWell API key + webhook secret (Task 14). · Sign-off on the backfill parity report per unit (Task 5) and on Unit 7's +$451.20. · QBO reconnect (Task 15).
