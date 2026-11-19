# Architecture rules

- Generate saved-submission PDFs through one fresh-record service and an explicit buyer-safe mapper; all download and preview paths must share it to prevent missing selections, stale notes, and inconsistent pricing. Staff downloads pass `staff=true` to append internal notes after the buyer-safe content; buyer-facing paths never do.
  - Buyer-safe exception (Task 13): `/my-quote` downloads use `generateBuyerQuotePdf` / `downloadBuyerQuoteWord`, which take the buyer's RPC rows (`get_my_quote_header` / `get_my_quote_lines`) by design, because buyers cannot read `buyer_selections` or `quote_lines`. They never pass `staff`.
- (Superseded in Phase 2 Task 18.) `buyer_selections.custom_pricing` is READ-ONLY, kept for audit: the generator still reads its overrides / custom items for a submission with no stored lines, and renderers read its follow-ups. Its only writer is `src/lib/followUps.ts` (console Notes panels), which read-modify-writes `followUps` and `basementNotes` only, conditional on `updated_at`, with a `followups_update` audit row (guarded by `scripts/callers.test.ts`, proven by `scripts/follow-ups.test.ts`); office prices and custom lines are edited as quote lines in the console.
- AI summaries of buyer upgrade requests run only in the admin-checked `summarize-upgrade-requests` edge function via `@lovable.dev/ai-gateway`; it sends selection fields, the change log (sanitised; actor as `buyer`/`staff`/`unknown`), client-visible quote lines and review comments — buyer text delimited as untrusted — and never internal/sales/admin notes or email addresses.
- Quote lines carry a `status`; only `upgrade` with an amount counts in totals (`countsInTotal`), others print as "Not included in total" and included lines at $0. The `guard_custom_pricing` trigger still rejects non-staff changes to `custom_pricing`; `pricing_config`/`upgrade_materials` stay admin-only. Word export (`submissionWordExport.ts`) shares `loadSavedSubmissionContext` and `buildLineRows` with the PDF so totals match.
- Bedroom premium carpet/underpad and stair carpet/underpad are priced by the generator (`generateQuoteLines`) via override keys `bedroomCarpet`, `bedroomUnderpad`, `stairCarpet`, `stairUnderpad`; editor toggles must exist for every priced flag.
- `buyer_selections.window_total` is write-once at submission and must not be read for display; use the `window_coverings` lines (`sumQuoteLines(...).windowCoverings`; guarded by `scripts/callers.test.ts`).

## Phase 1 additions (2026-11-18)

- `supabase/functions/_shared/authorizeSubmission.ts`: JWT and admin checks for `send-selections-email` (401 no/invalid JWT, 403 email mismatch unless admin); also parses notification recipients.
- `supabase/functions/_shared/internalAuth.ts`: in-function gate (service key, `x-internal-secret`, or admin JWT) for the edge functions that run with `verify_jwt = false`.
- `supabase/functions/_shared/buyerWording.ts`: buyer-facing wording (Primary Bedroom etc.) for edge-function renderers; mirrors `src/lib/outputLabels.ts`.
- `src/lib/outputLabels.ts`: shared buyer-facing label constants and render-time wording (`toBuyerWording`, `laundryValue`); engines keep internal names.
- `src/lib/submissionUpdatePayload.ts`: pure builder for the editor's `buyer_selections` update payload; add new editor fields here.
- `src/lib/areaNotes.ts`: `clientAreaNotes` (printed for the buyer) vs `internalAreaNotes` (staff only); area `comments` are internal, `clientComment` is buyer-visible.
- `portal_settings` table (migration `drizzle/migrations/0005_portal_settings.sql`): admin-editable notification recipients, read by `send-selections-email` at request time.
- `supabase/functions/_shared/loadServerPricing.ts`: the only edge loader for generator pricing (`QuotePricing`, alias `ServerPricing`; converts `markup_percentage` / `gst_rate` with `rateFromPercent`); every edge caller uses it.
- `supabase/functions/_shared/sanitizeChangesForAi.ts`: strips `sales_comments`, `admin_notes` and area `comments` from audit-log `changes` before any AI prompt.

## Phase 2 Task 14 (e-sign)

- `supabase/functions/_shared/esign/provider.ts`: the `EsignProvider` seam; `signwell.ts` is the only implementation and `providerFromEnv.ts` the only place one is built. SignWell secrets (`SIGNWELL_API_KEY`, `SIGNWELL_WEBHOOK_SECRET`, `SIGNWELL_TEST_MODE`) are edge env only, never `portal_settings`.
- `quote_snapshots` are insert-only (trigger in 0006; `scripts/esign-send.test.ts` fails on any client `.update`/`.delete`/`.upsert`). The signature PDF is the buyer render of the snapshot lines (`generateSnapshotBuyerPdf`, internal notes stripped); unit files live at `unit-documents/{unit_number}/{document_id}.pdf` (`unitDocumentPath`).
- `esign-webhook` verifies the signature before any parse or DB call, acts on `signed` only after the provider returns the completed PDF, confirms declined/voided via the provider API, and only moves `buyer_selections.status` forward (`esign_status_after_signed`, default `completed`).

## Phase 2 Task 15 (QuickBooks estimate)

- `qbo-sync-submission` builds the Estimate 1:1 from quote_lines via `supabase/functions/_shared/qboLinesMap.ts` (`estimateLinesFromQuoteLines`): Amount = line amount, totals = `sumQuoteLines`, SKU `GLEN-{SECTION}-{material_key | slug(label)}`, Items NonInventory with Name = Sku. It never calls a pricing engine (guarded by `scripts/qbo-lines-map.test.ts`) and answers 409 `quote has unpriced lines` (with `lineIds`) while any line is pending / under_review or an upgrade has no amount. QBO descriptions carry `client_note` only, never `internal_note`.

## Phase 2 Task 16 (staff role)

- `src/lib/rolePermissions.ts` is the only admin-area permission map (`ADMIN_ROUTES`, `canAccess`, `navItemsFor`, `routeRequiresAdmin`, `resolveRole`); every `/admin` route in `App.tsx` passes `requireAdmin={routeRequiresAdmin(path)}` and unknown routes are admin-only (guarded by `scripts/role-gating.test.ts`). A route opens to `staff` only when the tables it reads are staff-readable under RLS. `useRole()` (`src/hooks/useRole.ts`) gives `'admin' | 'staff' | 'client' | null`.
- Staff-facing edge functions gate with `authorizeStaffOrAdmin` (`_shared/internalAuth.ts`: service key / internal secret / admin or staff JWT; buyer JWT 403, none 401): `send-for-signature`, `resend-confirmation-email`, `resend-corrected-summary`, `sync-hubspot`. QBO, `manage-users`, `summarize-upgrade-requests`, `notify-pricing-request` and `audit-pricing-consistency` stay admin-only.
- `submission_audit_logs` (migration 0014): staff may SELECT and INSERT their own rows (`changed_by_user_id = auth.uid()`), never `pricing_request_notified` (the 0011 dedupe claim). Deleting submissions stays admin-only (UI hides it for staff; the delete counts the returned ids). `manage-users` refuses (409) removing your own admin role or the last admin (`manage-users/roleGuard.ts`).

## Phase 2 Task 17 (AI hardening)

- `summarize-upgrade-requests` builds its prompt only through `prompt.ts` (`buildSummaryPrompt`), which WHITELISTS fields (`SELECTION_SELECT`, `LINE_SELECT`, area / custom_pricing / change-log key lists); `internal_note`, `sales_comments`, `admin_notes`, area `comments` / `manualPriceNote`, custom item `note`, `basementNotes` and internal follow-ups never reach a prompt. Buyer free text (selection comments, area `clientComment`, line `client_note`, `buyer_request` labels, `quote_line_reviews.comment`) goes through `_shared/promptSafety.ts` `delimitUntrusted`; the system prompt carries `untrustedPreamble()`. Golden prompts: `scripts/fixtures/ai-golden/` (`scripts/ai-golden.test.ts`); a prompt change regenerates them deliberately (`UPDATE_AI_GOLDEN=1`).
- The model id is pinned once (`MODEL_ID` in `summarize-upgrade-requests/handler.ts`) with `MAX_OUTPUT_TOKENS`; every call logs `user_activity_logs` (`action_type 'ai_summary'`, `details {model, prompt_tokens, completion_tokens, submission_id}`, never prompt text), and `portal_settings.ai_monthly_token_cap` (0015, default 2,000,000) is checked before the call (`used + MAX_OUTPUT_TOKENS > cap` → 402 `ai_monthly_cap_reached`; the gateway's own rate limit stays 429).

## Phase 2 (quote lines) — rule

- P2: "`quote_lines` is the system of record for anything priced, included, pending or deferred. Nothing outside `generateQuoteLines` and the console may write a price. Renderers read lines; totals are `SUM(amount) WHERE counts_in_total` + GST."
- Enforcement (Task 18): the Phase 1 engines are deleted. `scripts/callers.test.ts` fails on any import of a deleted module (`upgradeTotals`, `upgradeTotalsServer`, `pricingFromDynamic`, `useWindowSubtotal`, `windowSubtotal`, `engineTotalsInput`, `CustomPricingPanel`, `compareEngineToLines`, `engineLineKeys`) and on markup / GST / percent→rate arithmetic in any non-test file outside `supabase/functions/_shared/quoteLines.ts`. Code that needs a marked-up or GST-inclusive figure (option hints, Pricing Control previews, console presets, loaders) calls `rateFromPercent`, `markedUp`, `gstOn`, `withGst` from that file; totals come only from `sumQuoteLines`. `scripts/parity.test.ts` pins the nine live subtotals from the lines.

## Phase 2 module map (by task)

- T1 `drizzle/migrations/0006_quote_lines.sql` — quote_lines, unit_base_spec, quote_snapshots, documents, quote_line_reviews, staff role, pricing_queue view; `scripts/lib/parseSql.ts` (migration tests).
- T2 `src/lib/baseSpec.ts` (BASE_SPEC per logical unit type) → `drizzle/migrations/0007_seed_unit_base_spec.sql` via `scripts/gen-base-spec-sql.ts`; edge mirror `supabase/functions/_shared/baseSpecData.ts`.
- T3 `supabase/functions/_shared/quoteLines.ts` (`generateQuoteLines`, `sumQuoteLines`, `countsInTotal`, price primitives; zero imports), re-exported by `src/lib/quoteLines.ts`.
- T4 `src/components/quote/RunningTotal.tsx` + `runningTotalModel.ts` (console, wizard and review-page rail).
- T5 `scripts/backfill-quote-lines.ts` (dry run / `--write --expect`), `scripts/lib/generateInputFromRow.ts` (row → GenerateInput for tests and backfill).
- T6 `src/hooks/useQuoteLines.ts`, `src/lib/quoteLinesApi.ts`, `quoteLinesReducer.ts`, `saveScheduler.ts` (autosave, flush, conflict reload); `0008_quote_lines_realtime.sql`.
- T7 `src/pages/AdminQuotes.tsx` (search-first list), `src/lib/quoteSearch.ts`, `src/pages/QuoteConsole.tsx` (`/admin/quotes/:id`).
- T8 console: `src/components/quote/{LineRow,SectionGroup,AddLineMenu,StatusSelect,ConsoleHeader,NotesPanels}.tsx`, `consoleCells.ts`; `src/lib/{addLinePresets,lineAmount,lineEdits,statusChange,consoleActions,consoleRenderers,guardedAction}.ts`; `0009_staff_directory.sql`.
- T9 wizard lines: `src/lib/generateInputFromSelections.ts`, `src/lib/draftWindows.ts`, `src/components/buyer/LocatedWindowsList.tsx`, `src/components/stepRail.ts`; `_shared/{quoteSelectionsFromRow,submissionRow,wizardSubmissionLines,wizardWindows}.ts`.
- T10 `src/lib/lineRenderRows.ts` (PDF/Word rows), `_shared/optionNames.ts`; `0010_counted_lines_visible.sql`.
- T11 `src/lib/submissionLinesLoader.ts` (paged batch read), `_shared/{savedSubmissionLines,lineRenderRows,linesEmailHtml}.ts`, `send-selections-email/emails.ts`, `resend-confirmation-email/emails.ts`, `sync-hubspot/quoteValues.ts`.
- T12 `notify-pricing-request`, `pricing-digest`, `_shared/{pricingQueue,adaptiveCard,notifyTransport}.ts`, `src/pages/AdminPricingQueue.tsx`, `src/hooks/usePricingQueue.ts`, `src/lib/pricingQueue.ts`, `.github/workflows/pricing-digest.yml`; `0011_portal_settings_notifications.sql`.
- T13 `/my-quote`: `src/pages/MyQuote.tsx`, `src/components/buyer/MyQuoteView.tsx`, `src/lib/myQuoteModel.ts`, `src/hooks/useLineReviews.ts`, `src/components/quote/BuyerResponseCell.tsx`, `src/components/BuyerRoute.tsx`, `src/lib/buyerNext.ts`, `_shared/buyerContact.ts`; `0012_buyer_change_request.sql`.
- T14 e-sign: `_shared/esign/*`, `send-for-signature`, `esign-webhook`, `src/components/quote/DocumentsPanel.tsx`, `src/lib/esignSend.ts`; `0013_esign_settings.sql`.
- T15 QBO estimate: `_shared/qboLinesMap.ts`, `qbo-sync-submission/handler.ts`, `src/lib/qboReconnect.ts`.
- T16 staff role: `src/lib/rolePermissions.ts`, `src/hooks/useRole.ts`, `src/lib/bulkDelete.ts`, `manage-users/roleGuard.ts`, `resend-corrected-summary/recipient.ts`; `0014_staff_audit_log.sql`.
- T17 AI: `summarize-upgrade-requests/{handler,prompt}.ts`, `_shared/promptSafety.ts`, `src/lib/aiSummaryError.ts`; `0015_ai_settings.sql`.
- T18 `src/hooks/useSubmissionLineTotals.ts` (list/report totals from lines), `src/lib/customPricing.ts` (read-only custom_pricing types + parser), `_shared/compareStoredToGenerated.ts` + `audit-pricing-consistency/handler.ts` (stored vs generated drift detector), `scripts/lib/parityPins.ts`; `trackingKeyFor` in `src/lib/submissionLineItems.ts`; `src/lib/followUps.ts` (follow-ups / basement notes writer).

## Phase 2 final fix wave (security notes and itemise-first)

- **Security precondition: Supabase Auth → Providers → Email → Confirm email ON** in every environment buyers use.
  Buyer identity is the JWT email (`get_my_quote_lines` / `get_my_quote_header` / `request_quote_change` / buyer
  `quote_line_reviews` policies match `auth.jwt() ->> 'email'`); an in-DB `email_confirmed_at` check cannot help
  (autoconfirm sets it). `BuyerAuth.tsx` shows "Check your email to confirm" when signUp returns no session
  (`src/lib/buyerSignUp.ts`). Runbook section 0 lists it with the other merge preconditions.
- Itemise-first: a submission is itemised when it has a stored `wizard` / `migration` line (`isItemised` in
  `_shared/savedSubmissionLines.ts`). Otherwise renderers use the generated lines plus any stored office /
  buyer-request lines appended (`linesSource: 'mixed'`; never a smaller total than the generated quote); the console
  shows "Itemise this quote" (`src/lib/itemiseQuote.ts`, `ItemiseBanner.tsx`: re-check, then one insert with
  sort_order 1..N; 0016's `quote_lines_one_migration_set` index on the sort_order-1 sentinel makes a concurrent
  second set fail with 23505 → "Already itemised — reloading"; never write sort_order 1 elsewhere) and locks Add line, status edits,
  Send for signature and Documents; `request_quote_change` (0012) refuses with `P0002`; the backfill reports
  `FAIL: partial-lines`. Code that branches on `linesSource` treats `mixed` like `generated` (`!== 'db'`).
- 0016: staff `documents` are SELECT / INSERT / UPDATE-while-unsigned (may void), no DELETE; `unit-documents`
  storage is staff INSERT + SELECT (client uploads use `upsert: false`; overwrites are service role only);
  `quote_line_reviews` staff SELECT only; `quote_lines.updated_by` is trigger-stamped (`FORBIDDEN_WRITE_KEYS`).
  `scripts/rls-smoke/` (`bun run rls-smoke`, local Supabase only) executes these rules; run it before any staff grant.
- Console amounts are written in cents (`lineAmount`); `qbo-sync-submission` refuses 409 `amount_sum_mismatch`
  before contacting QuickBooks and reuses an unmapped Estimate found by its PrivateNote.
- Buyer-typed text in Teams cards goes through `cardText` (`_shared/adaptiveCard.ts`: no markdown, no URLs);
  `promptSafety.stripUnsafe` deletes `\p{Cf}` before collapsing whitespace and redacts emails/URLs after.
