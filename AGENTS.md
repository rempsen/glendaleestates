# Architecture rules

- Generate saved-submission PDFs through one fresh-record service and an explicit buyer-safe mapper; all download and preview paths must share it to prevent missing selections, stale notes, and inconsistent pricing. Staff downloads pass `staff=true` to append internal notes after the buyer-safe content; buyer-facing paths never do.
  - Buyer-safe exception (Task 13): `/my-quote` downloads use `generateBuyerQuotePdf` / `downloadBuyerQuoteWord`, which take the buyer's RPC rows (`get_my_quote_header` / `get_my_quote_lines`) by design, because buyers cannot read `buyer_selections` or `quote_lines`. They never pass `staff`.
- Office price overrides and custom line items live in `buyer_selections.custom_pricing` and are applied only inside `computeUpgradeTotals` (client) and `computeUpgradeTotalsServer` (edge); every caller must pass `customPricing` so UI, PDFs, exports, PM and QuickBooks totals stay identical.
- AI summaries of buyer upgrade requests run only in the admin-checked `summarize-upgrade-requests` edge function via `@lovable.dev/ai-gateway`; it sends selection fields and change log only, never admin/sales notes.
- Office line items carry a `status`; only 'upgrade' (default) counts in totals, others surface via `pieces.uncommittedItems` and print as "Not Included in Total". The `guard_custom_pricing` trigger rejects non-staff changes to `custom_pricing` (staff may edit per-submission office pricing; `pricing_config`/`upgrade_materials` stay admin-only). Word export (`submissionWordExport.ts`) shares `loadSavedSubmissionContext` + `totalsInputFromSelections` with the PDF so totals match.
- Bedroom premium carpet/underpad and stair carpet/underpad are priced by the engines via override keys `bedroomCarpet`, `bedroomUnderpad`, `stairCarpet`, `stairUnderpad`; editor toggles must exist for every priced flag.
- `buyer_selections.window_total` is write-once at submission and must not be read for display; use the engine's `windowSubtotal` (guarded by `scripts/callers.test.ts`).

## Phase 1 additions (2026-11-18)

- `supabase/functions/_shared/authorizeSubmission.ts`: JWT and admin checks for `send-selections-email` (401 no/invalid JWT, 403 email mismatch unless admin); also parses notification recipients.
- `supabase/functions/_shared/internalAuth.ts`: in-function gate (service key, `x-internal-secret`, or admin JWT) for the edge functions that run with `verify_jwt = false`.
- `supabase/functions/_shared/buyerWording.ts`: buyer-facing wording (Primary Bedroom etc.) for edge-function renderers; mirrors `src/lib/outputLabels.ts`.
- `src/lib/outputLabels.ts`: shared buyer-facing label constants and render-time wording (`toBuyerWording`, `laundryValue`); engines keep internal names.
- `src/lib/itemizeWindows.ts`: converts window quantities into located custom lines (panel "Itemize windows by location").
- `src/lib/submissionUpdatePayload.ts`: pure builder for the editor's `buyer_selections` update payload; add new editor fields here.
- `src/lib/areaNotes.ts`: `clientAreaNotes` (printed for the buyer) vs `internalAreaNotes` (staff only); area `comments` are internal, `clientComment` is buyer-visible.
- `src/lib/pricingFromDynamic.ts` and `src/hooks/useWindowSubtotal.ts`: build engine pricing from `useDynamicPricing()` and return the engine's window subtotal for a row.
- `portal_settings` table (migration `drizzle/migrations/0005_portal_settings.sql`): admin-editable notification recipients, read by `send-selections-email` at request time.
- `supabase/functions/_shared/loadServerPricing.ts`: the only edge loader for `ServerPricing` (divides `markup_percentage` / `gst_rate` by 100); every edge engine caller uses it.
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
