# Glendale Selections Hub — Quote Lines Redesign (Approach B)

**Status:** Approved by Dan 2026-11-18 11:13 CT (answers in §11); Phase 1 shipped 2026-11-18; §6.16 addendum pending Dan's approval 17:00 CT — Phase 2 plan follows
**Date:** 2026-11-18
**Author:** Claude (design), from the 2026-11-18 system review, three code/research audits, and Dan's answers
**Repo:** `rempsen/glendaleestates` @ `499cb4a` · Lovable project `451d344e…` · Supabase `adtbjnwaxmxhyjkjxqoz`

---

## 1. Intent and why

BMD's account manager (Noni) sits with a homebuyer and must be able to change any selection, add any upgrade or custom item, record what the client said, mark what is pending, under review or deferred, flag anything she cannot price to Dan or Brian and get an answer back in the portal, and hand the buyer an itemized quote they can trust and respond to. Once agreed, the selection sheet or change order is signed and stored against the unit, and the lines flow on to ordering, inventory and payments.

Today the portal models a quote as ~60 flat columns plus three JSON blobs on `buyer_selections`, priced by two hand-synchronised copies of `computeUpgradeTotals`. The Unit 24 case (Safiniuk) shows the cost: the stair carpet/underpad switches are invisible for carpet-bedroom buyers (`src/components/admin/SubmissionEditor.tsx:549,581-599`), bedroom premium underpad is a flag that no engine prices (`src/lib/upgradeTotals.ts:191-382` has no input for `premium_underpad_bedroom`), motorization dropped out of a live quote when `automated_windows_qty` was added with default 0 and never backfilled (Unit 24 `window_total` 8,397.90 = (1,347 + 5,361 + 1,290) × 1.05, but `automated_windows_qty` = 0), windows are integer quantities with no location, and the buyer cannot see or respond to lines. The buyer's Nov 17 email is, line for line, a description of a quote-line model: location, product, quantity, unit price, line total, status.

**Decision:** make `quote_lines` the system of record for everything priced, included, pending or deferred on a unit, generate them from the wizard, let staff edit them in a meeting console, and have every output (admin view, Word/PDF, buyer review page, email, QuickBooks, ordering, payments) read the same lines. Deliver in four phases, the first of which is relief for Noni inside a week.

## 2. Goals, non-goals, anti-goals

**Goals**
1. Noni can add, change, re-price, relabel, annotate and status any line during a meeting, with totals updating live and a client preview one click away.
2. Every quote line carries location, product/colour, quantity, unit, unit price, amount, status and client-visibility. "Which windows?" is answered by data.
3. Anything Noni cannot price becomes a pending line assigned to Dan or Brian, who are notified and answer inside the portal; the buyer sees "Pending", never $0, never a guess.
4. The buyer sees the live itemized quote in the portal, can accept or question each line and leave comments; Noni sees responses. Word and PDF remain available.
5. Agreed quotes are signed in-app (tablet or emailed link) and stored per unit with version history.
6. Ordering, incoming inventory and payments read from the same lines (Phase 4).
7. All 9 existing submissions produce identical totals before and after migration, proven by an automated parity check.

**Non-goals**
- Re-platforming off Lovable/Supabase/React. Rewriting the buyer wizard (it is reduced in scope, not replaced).
- A general-purpose CPQ. Pricing rules stay as they are (sqft × material × markup, flat rates, manual price).
- Replacing HubSpot or QuickBooks.

**Anti-goals** (failure even if it "works")
- Totals that differ between any two surfaces (UI, PDF, Word, email, QBO).
- Internal notes reaching the buyer. Buyer-typed text reaching staff AI prompts unlabelled.
- A migration that changes a historical total by a cent without a human sign-off.
- Noni needing to know a column name, a flag, or a hidden branch to do her job.

## 3. Constraints

- **Lovable ↔ GitHub two-way sync.** Lovable commits as `gpt-engineer-app[bot]` whenever a prompt runs. Rule: pull before every change; one editor per change set; structural work via GitHub + Claude Code, UI polish via Lovable; `bun test` before every push.
- **Two engine copies until cutover.** `src/lib/upgradeTotals.ts` and `supabase/functions/_shared/upgradeTotalsServer.ts` must stay in lockstep until Phase 2 replaces both with a line summer. Phase 1 fixes are applied to both.
- **AGENTS.md invariants** (4 rules) remain in force and gain one more per phase (see §12).
- **Nine live submissions** (Units 2, 4, 7, 24, 27, 31, 37, 38, 43) and 30 drafts. Historical totals are contractual-adjacent; see parity rule in §6.4.
- **Roles.** Only `admin` and `user` exist; `guard_custom_pricing` and the RLS policies require `admin`. Noni must hold `admin` today. A `staff` role is introduced in Phase 2 (§6.9).
- **Money.** GST 5% on the committed subtotal; PST is built into prices; all stored amounts are pre-GST CAD. New subscription spend ≤ US$30/month.
- **Security debt in scope.** `send-selections-email` is callable with the anon key and inserts with the service role (`supabase/config.toml` `verify_jwt = false`; `index.ts:713`). Internal recipients are hardcoded (`index.ts:1187`).
- **Buyer identity** is the Supabase Auth email; buyer RLS matches `lower(email)`.

## 4. Approaches considered

| | A — Harden what exists | **B — Quote lines as system of record (chosen)** | C — Proposal tool (PandaDoc/Qwilr) for review + sign |
|---|---|---|---|
| Model | Keep flag columns + `area_upgrades` + `custom_pricing` JSON; extend `status` to area rows; add toggles/overrides | New `quote_lines` table; wizard and engine generate lines; everything reads lines | Keep A or B internally; push a document to a third-party tool for comments/accept/sign |
| Fixes Noni's blockers | Yes (week 1) | Yes (week 1, same fixes) | No (doesn't touch editing) |
| "Which window?" | By convention (custom items named by location) | By data (location column) | n/a |
| Buyer per-line response | Needs a projection of engine output anyway | Native: review rows keyed to line ids | Document-level accept + comments only; duplicates pricing; sync back to portal and QBO |
| Ordering / inventory / payments | Keep bolting on to `submission_line_items` synthesised from engine output | Lines are the natural unit of ordering and invoicing | n/a |
| Effort | ~2–3 weeks | ~6–7 weeks, phased | +US$600–1,200/yr, +integration |
| Main risk | Every new item type = another column + branch in two engines; drift continues | Migration + parity burden up front | Two sources of truth |

**Why B.** The buyer's complaints, Noni's needs, and the ordering/inventory/payments goals all resolve to the same object: a line with a location, a product, a quantity, a price and a status. A's model cannot express it without more flags. C adds a second place where prices live. B's cost is the migration, and the project already has the harness to make that safe (`audit-pricing-consistency`). Dan chose B on 2026-11-18.

## 5. Data flow (target state)

```
 Buyer (wizard, /select)                    Staff (meeting console, /admin/submissions/:id)
        │ submit                                     │ add / edit / status / flag
        ▼                                            ▼
 buyer_selections ──generate──▶  quote_lines  ◀──────┘        ┌── pricing owner (Dan/Brian)
 (identity, raw answers,          (system of record)           │   answers pending lines
  base-spec choices)                   │   ▲                   ▼
                                       │   └── quote_line_reviews (buyer accept / question / comment)
                                       │
          ┌────────────┬───────────────┼───────────────┬──────────────┬──────────────┐
          ▼            ▼               ▼               ▼              ▼              ▼
    Admin console   Word / PDF    Buyer review     Email (Resend)   QBO Estimate   Ordering & PM
    (live totals)   export        page (/my-quote)                  → Invoice      (POs, receiving)
                                                                         │
                                                      quote_snapshots ───┴──▶ documents (signed PDFs via e-sign webhook)
                                                                                     │
                                                                              payments ledger ──▶ QBO Payment
 Notifications: pricing request → Teams Workflows card (primary) → Resend email (fallback) → in-app queue (always)
```

System of record: `quote_lines` (current state) + `quote_snapshots` (what was shown/signed, immutable). `buyer_selections` keeps identity, possession date, document uploads, and the raw wizard answers for audit; it stops being the thing that is priced.

## 6. The decided parts of the how

### 6.1 `quote_lines`

One row per thing on the quote — included standard item, priced upgrade, pending item, deferred item, or a buyer request.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `submission_id` | uuid fk → buyer_selections | one quote per submission |
| `sort_order` | int | staff-controlled |
| `section` | text enum | `standard`, `flooring`, `tile`, `backsplash`, `stairs`, `window_coverings`, `bathroom`, `basement`, `other` |
| `location` | text | "Primary Bedroom", "Stairs to Lower Level", "Living Room window" — free text with presets per unit type |
| `label` | text | what the buyer reads |
| `product_name`, `product_colour` | text | |
| `material_key` | text nullable | fk-ish to `upgrade_materials.material_key` when catalog-priced |
| `quantity` | numeric nullable | |
| `unit` | text | `sqft`, `sqyd`, `each`, `flat` |
| `unit_price` | numeric nullable | pre-GST |
| `amount` | numeric nullable | `quantity × unit_price` when both present, else manual; null when pending |
| `pricing_mode` | text enum | `catalog` (computed from material + area + markup), `flat_rate` (pricing_config key), `manual`, `included` |
| `price_source_ref` | text nullable | the config key / material key / override used — for the audit trail |
| `status` | text enum | `included`, `upgrade`, `pending`, `under_review`, `deferred`, `removed` |
| `counts_in_total` | boolean generated | true iff `status = 'upgrade'` and `amount` not null |
| `client_visible` | boolean | default true; `false` for internal-only lines (e.g. reconciliation) |
| `client_note` | text | printed to buyer |
| `internal_note` | text | never printed to buyer |
| `source` | text enum | `wizard`, `office`, `buyer_request`, `migration` |
| `flagged_to` | uuid nullable → profiles | who must price/answer |
| `flagged_at`, `answered_by`, `answered_at` | | |
| `provisional` | boolean | "to be chosen at the Nov 26 meeting" |
| `wizard_field` | text nullable | which `buyer_selections` column/area this line was generated from (for regeneration and audit) |
| `created_by`, `updated_by`, `created_at`, `updated_at` | | |

Rules: `amount` is never displayed as $0 when `status = 'pending'`; renderers print "Pending". `under_review` and `deferred` lines print in a "Not included in total" block with their amount if known. `removed` lines are kept for audit and hidden everywhere else.

### 6.2 Base-spec inclusions table

`unit_base_spec(unit_type_code, section, location, label, default_product, default_colour_options jsonb, is_included boolean)` — one row per standard inclusion per unit type (e.g. Type C: "Laundry — LVP plank", "Primary Bedroom — carpet", "Bedroom windows — roller shades included"). Line generation reads it; "Bathroom/Laundry Tile" stops being a string in `buyerPdfGenerator.ts:369-372` and the email at `send-selections-email/index.ts:1315`. Seeded from the current PDF logic plus the Condo Base Specifications document (builder to request it from Dan if not in the repo — see §11).

### 6.3 Window coverings as located lines

The three integers (`additional_windows_qty`, `patio_doors_qty`, `automated_windows_qty`) become lines: one per window/door with `location`, `product_name` (roller shade 5% / blackout / panel track), `quantity 1`, `unit_price` from `pricing_config`, plus a separate "Somfy motorization" line per motorized door. Included bedroom shades are `status = 'included'`, amount 0. The wizard's Windows step is reshaped to collect windows by location (preset list per unit type from `unit_base_spec`, with "add another"). Until Phase 2 ships, Phase 1 represents located windows as custom items (§8).

### 6.4 Line generation and parity

- `generateQuoteLines(submission, pricing, unitAreas, baseSpec)` is a pure function living beside the current engine. For each existing submission it emits lines whose `counts_in_total` sum equals `computeUpgradeTotals(...).grandSubtotal` **to the cent**, line for line against `lineItems`.
- The parity harness extends `supabase/functions/audit-pricing-consistency` (which already computes canonical totals per submission and scrapes rendered output): add a mode that compares engine `lineItems` ↔ generated lines, and later engine totals ↔ `SUM(quote_lines)`. It runs in CI (`bun test` fixture of the 9 live rows, anonymised) and on demand against prod.
- Migration backfill writes `source = 'migration'` lines for the 9 submissions and 0 lines for drafts (drafts regenerate at submit). Any submission whose parity fails is listed, not auto-fixed; Dan signs off per unit. Known exception to expect: Unit 24 motorization (§8, backfilled in Phase 1 before migration).
- After cutover the "engine" is `SUM(amount) WHERE counts_in_total` + GST. The two old engine copies are deleted in Phase 2's last task; until then they are kept green by the harness.

### 6.5 Pricing requests (status-based queue)

No separate table: a pricing request is a line with `status = 'pending'` and `flagged_to` set. A view `pricing_queue` lists open ones by assignee with unit, location, label, Noni's `internal_note`, and age. Answering = setting `unit_price`/`amount`, `status = 'upgrade'` (or `included`/`deferred`), `answered_by/at`. Every transition is written to `submission_audit_logs` by trigger.

### 6.6 Notifications

- On `flagged_to` set or changed: edge function `notify-pricing-request` posts an Adaptive Card to a **Microsoft Teams Workflows** webhook (the classic Office 365 connector webhook is retired as of May 2026; Workflows is the replacement and is included with M365). Card: unit, buyer, location, label, Noni's note, deep link to the console row, "Open in portal" button.
- If the POST fails, or the line is still pending after N hours (default 4, setting), send a **Resend** email to the assignee. Daily 08:00 CT digest of all open pending lines to Dan and Brian.
- The in-app queue (`pricing_queue` + a badge in the admin nav via Supabase Realtime) is the record regardless of channel.
- Recipient addresses and the webhook URL move to a `portal_settings` table edited at `/admin/settings/notifications`; the hardcoded list at `send-selections-email/index.ts:1187` is removed.

### 6.7 Buyer review page

`/my-quote` for the signed-in buyer: the live itemized quote grouped by section with columns location · item · product/colour · qty · unit price · amount · status. Each client-visible line has Accept / Question / Comment. Responses go to `quote_line_reviews(id, line_id, buyer_user_id, response enum('accepted','questioned'), comment, created_at)`; the latest response per line is shown to staff in the console and summarised in the daily digest. A "Request a change" box creates a `buyer_request` line (status pending, flagged to the unit's sales rep). The page offers "Download Word" and "Download PDF" built from the same lines. Buyer RLS: lines where `client_visible` and the submission's email matches `auth.jwt() ->> 'email'`.

### 6.8 Snapshots, documents, e-sign

- `quote_snapshots(id, submission_id, version int, lines jsonb, subtotal, gst, total, created_by, created_at, purpose enum('quote','change_order','contract'))` — immutable copy taken when a quote is sent, signed, or on demand.
- `documents(id, submission_id, snapshot_id, kind enum('selection_sheet','change_order','purchase_agreement','deposit_receipt','other'), storage_path, provider, provider_envelope_id, status enum('draft','sent','signed','declined','voided'), signed_at, signer_email, uploaded_by)`; files in private bucket `unit-documents/{unit_number}/{document_id}.pdf`. Staff may also upload externally signed PDFs.
- **E-sign flow:** staff clicks "Send for signature" → snapshot → PDF rendered from the snapshot (same renderer as the buyer PDF) → provider document created from a template with signer = buyer email → embedded signing in the console (tablet in the meeting) or emailed link → provider webhook (`esign-webhook` edge function, signature verified) marks `documents.status = 'signed'`, downloads the signed PDF to storage, logs the audit entry, and advances `buyer_selections.status` to `quoted`/`completed` per settings.

### 6.9 Roles

Add `staff` to `app_role`. `staff` can read all submissions, edit lines, create pending lines, upload documents, send for signature; cannot change `pricing_config`/`upgrade_materials`, manage users, or connect QBO. `admin` keeps everything. `guard_custom_pricing` and the line RLS accept `staff` or `admin`. Noni → `staff`.

### 6.10 Meeting console UX (one screen)

Route `/admin/submissions/:id/console`. Layout:

```
┌ Unit 24 · Deb Safiniuk · Corner Unit C · Possession 2027-09-15 · Status: submitted ──── [Client preview] [Word] [PDF] [Send for signature] ┐
│ Sections ▸ Standard inclusions ▸ Flooring ▸ Tile ▸ Backsplash ▸ Stairs ▸ Window coverings ▸ Bathroom ▸ Basement ▸ Other                  │
│ ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Location            Item / product / colour                 Qty  Unit   Unit price   Amount     Status        Visible  Flag to  ⋮ │ │
│ │ Primary Bedroom     Premium underpad                         44  sqyd   $6.00×1.6    $422.40    Upgrade ▾     ✓        —        ⋮ │ │
│ │ Stairs to Lower Lvl Premium carpet + underpad (Windsor 8208)  1  flat   —            $1,005.00  Under review ▾ ✓        Dan      ⋮ │ │
│ │ Living Room window  Roller shade 5%                           1  each   $673.50      $673.50    Upgrade ▾     ✓        —        ⋮ │ │
│ │ Basement            Premium underpad                          —  —      —            Pending    Pending ▾     ✓        Brian    ⋮ │ │
│ │ [+ Add line ▾ catalog preset | flat rate | manual | included | request pricing]                                                   │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ Totals (live): Upgrades $8,253.60 · Window coverings $…  · Subtotal $… · GST 5% $… · Total $…      Not in total: 2 lines ($1,005 + Pending) │
│ ┌ Client notes (printed) ───────────┐ ┌ Internal notes (never printed) ───────┐ ┌ Follow-ups ─────────────┐ ┌ Buyer responses ───────────┐ │
│ │ LVP colour provisional — Nov 26   │ │ 2×637.50 reconciliation; OSB thickness │ │ ☐ Blind viewing location │ │ Stairs: Questioned (Mike)  │ │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Behaviours: inline edit with autosave per row and a visible "Saved ✓ 10:42:13" / error; catalog preset fills material, unit, unit price from Pricing Control (never a hardcoded "$300"/"$640" as at `SubmissionEditor.tsx:134,687,912`); "Request pricing" creates a pending line and opens the flag-to picker; status change asks for a client-facing reason when moving to `under_review`/`deferred`; "Client preview" renders from current (unsaved rows flush first); keyboard-first; works on an iPad in landscape. The old `SubmissionEditor` remains for buyer-identity fields and raw wizard answers.

### 6.11 Outputs

All renderers read lines (and, for sent/signed documents, the snapshot). Columns everywhere: location · item · product/colour · qty · unit price · amount · status. Order of cutover: admin console → Word/PDF (`submissionWordExport.ts`, `buyerPdfGenerator.ts`) → buyer page → email (`send-selections-email`) → QBO estimate (`qbo-sync-submission` maps lines 1:1 to Items/SKUs — the SKU becomes `GLEN-{section}-{material_key or slug}`) → PM/ordering. Each cutover ships with the harness proving identical totals before and after.

### 6.12 Payments ledger (Phase 4)

`payments(id, submission_id, kind enum('deposit','progress','final','refund'), amount, method, received_at, reference, qbo_payment_id, document_id nullable, created_by)`. `sales_pipeline.deposit_*` and `submission_payments.*` become views/derived fields over the ledger; the two forms are replaced by one. QBO: Estimate → Invoice on `quoted → approved`; Payment on each ledger row.

### 6.13 Ordering and inventory (Phase 4)

`submission_line_items` is re-keyed to `quote_line_id`. New screens: Purchase orders per supplier across units (lines grouped by supplier/material/colour, PO number, dates), Receiving (qty received, storage location, variance vs required), "Ready to install" rollup by unit. Line status `upgrade`+accepted drives order eligibility; `pending`/`under_review` block it.

### 6.14 Security fixes (Phase 1–2)

- `send-selections-email`: require a user JWT; verify `email` matches the token; move the insert to a `submit_selection()` RPC under the existing buyer RLS policy or keep service-role insert but only after JWT verification. Return an error (and keep the draft) when the insert fails instead of emailing success (`index.ts:757-760` logs and continues).
- Set `verify_jwt = true` on `sync-hubspot`, `setup-hubspot-properties`, `send-draft-reminder`, `send-user-notification`, `resend-confirmation-email`, `audit-pricing-consistency`; internal invocations use `x-internal-secret` as `qbo-sync-submission` already does.
- Recipients and webhook URLs in `portal_settings` (admin-only RLS).

### 6.16 Running total and quote workspace (addendum 2026-11-18 17:00 CT, from Noni's feedback)

Noni's feedback after Phase 1: staff must always see a live total of upgrades while with a client — a selection changes the number immediately, with no preview or PDF — and reworking an existing quote months later must not take four clicks through Submissions → View → Edit.

- **`RunningTotal` rail.** One shared component, pinned to the right on desktop (collapses to a bottom sheet with the total always visible on tablet/phone). Contents: every line that counts in the total (location · label · amount), a "Not in total" group (pending / under review / deferred with amount or "Pending"), then Upgrades · Window coverings · Subtotal · GST 5% · Total, and a "Saved ✓ hh:mm:ss" / "Saving…" indicator in the console. It recomputes on every change from in-memory state (unsaved edits included); it is the only place totals are shown on a screen, so the number the buyer sees and the number on the PDF are the same function.
- **Where it appears.** (a) The meeting console (§6.10) — it replaces that layout's bottom "Totals (live)" strip; (b) the buyer wizard (`/select`) on every step from the first priced step onward, buyer-visible lines only, computed from `generateQuoteLines` over the in-progress selections (the wizard shows the same lines it will submit); (c) the buyer review page (§6.7).
- **Quotes list.** Route `/admin/quotes`: a search box (unit number, buyer last name, email) with results as you type, a "Recent" strip of the last quotes this user opened, and status chips. Opening a result lands directly in the console (`/admin/quotes/:id`, the console route from §6.10 — `/admin/submissions/:id/console` redirects to it). The console header carries "Edit buyer details" for the legacy `SubmissionEditor` fields. Submissions keeps its list/report role; "Open quote" replaces its View → Edit pair.
- **Wizard parity.** Because the wizard now shows lines, line generation must run client-side for drafts: `generateQuoteLines` stays pure and dependency-free so the same module runs in the browser, in edge functions and in the harness.

### 6.15 AI-specific concerns

- **Prompt injection:** buyer-typed text (`window_comments`, `lvp_comments`, line `client_note`, review comments) enters `summarize-upgrade-requests`. Treat as data: wrap in delimiters, instruct the model that it is untrusted, strip URLs/HTML, and never feed `internal_note`/`sales_comments`/`admin_notes` (AGENTS.md rule 3 already). Add a fixture test with an injected instruction in a comment.
- **Model/cost drift:** pin the model id in `summarize-upgrade-requests`; log tokens per call to `user_activity_logs`; monthly cap setting.
- **Evals:** 5 golden submissions with expected summaries; run on model change.

## 7. Tool decisions (ADR form)

### ADR-1 E-signature provider

- **Context:** ~50–150 documents/yr; embedded signing on a tablet in meetings and emailed links; webhooks; ≤ US$30/mo.
- **Options (verified 2026-11-18 by the research agent):**
  - SignWell API — embedded signing, templates, webhooks included; first 25 API docs/month free, then from US$0.85/doc; unlimited test. Documented: https://www.signwell.com/api-pricing/ , https://developers.signwell.com/reference/embedded-signing
  - BoldSign API — from US$30/mo incl. 40 envelopes, US$0.75 extra; embedded; **Canada (Toronto) data centre selectable**. Documented: https://boldsign.com/electronic-signature-pricing/?plan=api
  - Dropbox Sign API — embedded signing requires Standard US$250/mo (Essentials US$75/mo is email-link only). Documented: https://sign.dropbox.com/api , https://help.dropbox.com/plans/how-much-does-the-dropbox-sign-api-cost
  - DocuSign eSignature API — embedded signing excluded below Enhanced (contact sales). Documented: https://ecom.docusign.com/plans/developer
  - Documenso — hosted Teams US$40/mo for API + embedding; self-host AGPL. Documented: https://documenso.com/pricing
- **Scoring (gates: budget, embedded signing, webhooks, Canada availability):** SignWell and BoldSign pass all gates; Dropbox Sign and DocuSign fail the budget gate for embedded; Documenso passes but exceeds budget hosted and adds ops self-hosted.
- **Decision:** SignWell first (US$0 at this volume). BoldSign if Canadian data residency is required by BMD's counsel or the builder (open question §11). Provider behind a small `EsignProvider` interface so the switch is one file.
- **Consequences:** signed PDFs are stored in Supabase Storage regardless of provider, so provider lock-in is limited to templates and envelope ids.

### ADR-2 Staff notifications

- **Options:** Teams Workflows webhook (M365, included; classic connector webhooks retired May 2026 — https://learn.microsoft.com/en-us/answers/questions/5854971/will-teams-incoming-webhooks-stop-delivering-alert), Resend email (in use), Twilio SMS (US$0.0083/segment + Canadian carrier fees, A2P registration/CASL overhead — https://www.twilio.com/en-us/sms/pricing/ca), in-app queue.
- **Decision:** Teams card primary, Resend fallback + daily digest, in-app queue always. No SMS.

### ADR-3 Buyer review surface

- **Options:** build in portal; PandaDoc Business US$49/seat/mo; Qwilr US$35–55/user/mo.
- **Decision:** build. The portal already has buyer auth and the lines; external tools give document-level accept only and create a second price store.

## 8. Phases

### Phase 1 — Relief for Noni (week 1; ships to prod via GitHub → Lovable Publish)
Scope (all on the current model; both engine copies):
1. ~~Unhide stair premium carpet/underpad switches~~ **Done 2026-11-18, commit `fa3141b` (awaiting Lovable Publish).** Remaining item verified done: the stair carpet/underpad switches now sit inside the `has_stairs` block of `SubmissionEditor.tsx` and show for any bedroom flooring choice (hidden only when Stair LVP upgrade is selected, which is mutually exclusive). *(audit #1)*
2. ~~Price `premium_underpad_bedroom` and `premium_carpet_bedroom`: add inputs to both engines using master-bedroom sqyd × material × markup, with override keys `bedroomCarpet`, `bedroomUnderpad`; add editor toggles; add tests.~~ **Done 2026-11-18, commit `e8e0d9b` (both engines), `a51fca6` (all totals callers + editor toggles), `96c89f3` (canonical lines for the PM hub).** Unit 7 parity pin moved 2,845.50 → 3,296.70 (+451.20, 47 sq yd × 6 × 1.6) as intended. *(audit #2)*
3. ~~Apply `ov('stairCarpet')`/`ov('stairUnderpad')` in both engines and add the two override inputs to `CustomPricingPanel` (`upgradeTotals.ts:217-221`, `upgradeTotalsServer.ts:75,262-266`).~~ **Done 2026-11-18, commit `c33bf38`.** *(audit #4)*
4. ~~Stop `handleSave` clobbering `heated_floor_bathrooms` and dropping `areaLabel` (`SubmissionEditor.tsx:195-197,226-235,284`).~~ **Done 2026-11-18, commit `76c67ed` (payload builder `submissionUpdatePayload.ts`).** *(audit #5, #10)*
5. ~~Area-upgrade `comments` become internal unless a new `clientComment` field is set; buyer PDF/Word/email print only client fields (`buyerPdfGenerator.ts:727-739`).~~ **Done 2026-11-18, commit `88a559e` (client vs internal notes), `761c707` (strip internal area comments at the buyer-safe boundary).** *(audit #11)*
6. ~~Live totals inside `CustomPricingPanel`/editor computed from unsaved state; "Client preview" flushes first (`CustomPricingPanel.tsx:249`).~~ **Done 2026-11-18, commit `df35c42`, `ab5bf5a` (live totals strip; Client preview/Word save first; parent row kept current).** *(audit #3)*
7. ~~Editor inputs for `automated_windows_qty`, `custom_tiled_shower`, bathroom tile flags, `admin_notes`; wire `StatusWorkflowControl` and `AdminNotesSection` or delete them.~~ **Done 2026-11-18, commits `f6bbdce`, `ffc1585`, `3d5626f` (editor inputs, status workflow wired, legacy status Select removed, heated-tile count).** *(audit #13)*
8. **OPEN, not done.** Backfill `automated_windows_qty` for pre-migration submissions where `window_total` implies motorization. **Unit 24 done 2026-11-18 (→ 2, audit-logged).** Remaining 8 units: report each implied change for Dan's sign-off before writing (nothing written; no commit).
9. ~~Window lines by location as custom items (interim): a helper in the panel that converts the integer quantities into located custom lines in one click, with included bedroom shades at $0. (`status = 'included'` renders as "Included — $0", not under "Not included".)~~ **Done 2026-11-18, commits `df35c42` (itemize-windows helper), `bf4f903` (included lines render in Standard Selections).**
10. ~~Retire stale `window_total` reads (`AdminSubmissions.tsx:1218`, `emailPreview.ts:90`, `submissionPdfGenerator.ts:346`, `useDashboardData.ts:149`, `AdminSalesAnalytics.tsx:105`) in favour of engine output.~~ **Done 2026-11-18, commit `35a967d`.** *(audit #9)*
11. ~~Security: JWT on `send-selections-email`; fail loudly on insert error; recipients to `portal_settings`.~~ **Done 2026-11-18, commits `b1c7e53` (`portal_settings` + recipients page), `8c43b4a` (buyer JWT, fail loudly on save errors), `09b2139` (in-function gating of five more edge functions).**
12. ~~Fix label strings pending Phase 2 (`buyerPdfGenerator.ts:405-407`, email `:1315,:1340`, CSV `:68-72,:113`).~~ **Done 2026-11-18, commits `a683fbc`, `2b7b24a` (shared `outputLabels.ts`; PDF, Word, email, CSV, resend-confirmation; Primary Bedroom wording).**

Acceptance: Noni, as `admin`, adds Primary Bedroom underpad and lower-stair carpet+pad to a carpet-bedroom test unit in under 60 seconds without help; totals update before save; parity harness green for all 9 units with the Unit 24 motorization change the only diff and signed off; `bun test` green; buyer PDF contains no internal text.

Acceptance status (2026-11-18):
- `bun test` green: 109 pass, 0 fail, 18 files (run 2026-11-18 on `2b7b24a`).
- Parity harness (`scripts/parity.test.ts`, 9 units) green. Unit 24's motorization (10,388.40, backfilled to 2 openings) is already in the pins. Note Unit 7 moved 2,845.50 → 3,296.70 on purpose when bedroom premium pricing landed (`e8e0d9b`, +451.20), so it is a second diff that needs Dan's sign-off.
- Buyer PDF contains no internal text: pinned by `scripts/buyer-pdf-selections.test.ts` (`scripts/callers.test.ts` guards the `window_total` rule).
- Noni walkthrough: pending (checklist below).

Noni walkthrough checklist (use a draft/test unit, never a real buyer; target under 60 seconds start to finish):
1. Go to Admin → Submissions and open the draft/test submission (carpet bedrooms, has stairs). Start your timer.
2. In the editor, find "Bedroom Carpet — Premium Upgrades" and turn on the "Premium Underpad" switch (and "Premium Carpet" if the test calls for it).
3. Under "Stairs to Lower Level — Carpet Upgrades", turn on both "Premium Carpet" and "Premium Underpad".
4. In the Custom Pricing panel, watch the "Totals (live)" strip (Window coverings, Upgrades, Subtotal, GST, Total). The numbers should change right away, before you save.
5. Click "Save Changes" at the top.
6. Click "Client preview (PDF)". Confirm no internal notes or office wording appear anywhere.
7. Download the buyer PDF. If the unit has a pending line, find the row that says "Pending" where a price would be.
8. Stop the timer and write the time down. Anything slow, confusing or unlabeled goes back to Dan.

Deploy notes (Phase 1):
- Apply migration `drizzle/migrations/0005_portal_settings.sql` before Publish. Lovable applies drizzle migrations on sync; verify with `select * from portal_settings`.
- Publish the frontend and the edge functions together. The new `send-selections-email` rejects the old anon-key wizard, so an unpublished frontend cannot submit.
- Merge-to-Publish gap: merging to `main` deploys the edge functions at once, but the frontend waits for a human Publish in Lovable. Between merge and Publish the live wizard (anon key) gets 401 on every submission. Merge at a quiet time and click Publish immediately after the merge.
- Before merge, confirm `SUPABASE_SERVICE_ROLE_KEY` is a legacy `eyJ…` JWT. `sync-hubspot` now has `verify_jwt = true` and is called with `Bearer <service key>`; an `sb_secret_…` key would be rejected at the gateway.
- Drafts saved before deploy hold the buyer's area note in `buyer_selection_drafts.areaUpgrades[].comments`. This is handled in code: on draft resume the wizard moves `comments` to `clientComment` and clears `comments` (`src/lib/draftClientComments.ts`, test `scripts/draft-client-comments.test.ts`). No data migration is needed for drafts.
- Open sign-offs for Dan before Publish:
  - Unit 7 total rises by $451.20 (+ GST): the premium bedroom underpad flag was never priced before. Waive it with the "Primary Bedroom premium underpad" override at $0 if that was the intent.
  - The `window_total_db` export column is removed.
  - Flat-export headers are renamed; any saved spreadsheet formulas that reference the old headers need updating.
  - "Itemize windows by location" moves those dollars from the Windows subtotal to the Upgrades subtotal (grand total unchanged).
- Whatever schedules `send-draft-reminder` must send header `x-internal-secret` set to the service-role key, or the function returns 401.
- Set Lovable project knowledge to: "Follow AGENTS.md. Pricing engines (`src/lib/upgradeTotals.ts`, `supabase/functions/_shared/upgradeTotalsServer.ts`) and renderers are frozen pending the quote-lines migration; make UI-only changes unless Dan asks otherwise. Run `bun test` before committing."
- Until Publish, the old live code hides area comments on regenerated PDFs.

### Phase 2 — Quote lines + migration + meeting console (weeks 2–4)
`quote_lines`, `unit_base_spec`, `staff` role, `generateQuoteLines`, parity harness mode, backfill with per-unit sign-off, meeting console, cutover of admin view → Word/PDF; wizard Windows step reshaped to located windows; `pricing_queue` + Teams/Resend notifications + settings page; old engines deleted last. **Addendum §6.16:** `RunningTotal` rail in console, wizard and review page; `/admin/quotes` search-first list with the console at `/admin/quotes/:id`.
Acceptance: all 9 submissions' totals identical pre/post (harness); console passes a scripted Unit 24 meeting walkthrough (the 12 corrections from Mike's email) end to end; Word/PDF show the six columns; a pending line reaches Dan's Teams within 1 minute and the email fallback within the configured window; no code path computes a price outside line generation. Noni can find any unit from `/admin/quotes` and be editing it within two clicks; every change she makes moves the running total before she saves; the wizard shows a buyer the running total from the first priced step.

### Phase 3 — Buyer review, requests, e-sign (weeks 4–6)
`/my-quote`, `quote_line_reviews`, buyer requests, snapshots, documents, SignWell integration, `esign-webhook`, email cutover, QBO estimate from lines.
Acceptance: a buyer can accept/question lines and the response appears in the console; a signed selection sheet lands in `unit-documents` within 1 minute of signing with status `signed`; an email sent to the buyer and the QBO estimate match the console total.

### Phase 4 — Ordering, inventory, payments (weeks 6–7)
Payments ledger + one payments form; QBO Invoice/Payment; POs, receiving, ready-to-install; `submission_line_items` re-keyed; PM page reads lines.
Acceptance: deposit recorded once appears in pipeline, PM and QBO; a PO can be produced per supplier across units from accepted lines; variance report shows required vs ordered vs received.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Lovable prompt lands mid-cutover and edits a renderer we are replacing | Pull-first rule; Lovable project knowledge set to "pricing/renderer files are frozen; see AGENTS.md"; CI parity check fails the PR |
| Historical total changes during migration | Harness lists diffs; no auto-fix; Dan signs off per unit; snapshots of all 9 taken before migration |
| Buyer identity by email mismatch (hotmail vs the account that signed up) | Review page shows "no quote found" with a staff contact; staff can link a second email in Phase 3 |
| Teams Workflows URL rotates or flow is disabled | Fallback email on POST failure; settings page health check button |
| SignWell free tier limits or policy change | Provider interface; BoldSign swap costed at US$30/mo |
| Noni must be `admin` until `staff` exists | Phase 1 grants admin; Phase 2 downgrades to staff |
| Two engines drift during Phase 1 | Every Phase 1 change has a test fixture and the harness compares client vs server totals |

## 10. What's left to the builder

- Exact Postgres enums vs check constraints; whether `counts_in_total` is a generated column or a view.
- Autosave debounce, optimistic UI, conflict handling when two staff edit the same quote.
- Word/PDF visual design within the existing brand (keep current typography/colours).
- The Adaptive Card layout; digest email layout.
- Whether `/my-quote` reuses the wizard's auth page or gets its own entry link in the confirmation email.
- Wizard windows step UI details (preset list per unit type is data; the form is the builder's).
- SKU scheme details for QBO Items beyond the stated prefix pattern.
- PO/receiving screen layouts (Phase 4), within the console's visual language.

## 11. Dan's decisions (2026-11-18, 11:13 CT)

1. **Base specifications** — provided by Dan (recorded in the project doc *Glendale Base Specifications*, which seeds `unit_base_spec`): XL Flooring LVP throughout as standard; Ceratec Dante 2.0 LVT in all washrooms; Luxor I carpet (Dream Weaver) on stairs — first-to-second floor where a second level exists, and main-to-lower-level in every unit (all basements unfinished); Graber blackout roller shade in every bedroom; bedrooms at no cost either XL LVP or Luxor carpet + standard underpad; 3×8 subway backsplash in the kitchen. *Open seeding detail for the builder:* the Materials Guide lists Dante 2.0 for "Bathrooms & Laundry" while the spec says plank throughout — confirm laundry default per unit type with Dan before seeding.
2. **Who prices what (default `flagged_to`)** — flooring and tile → Brian; anything basement (incl. gazebos, indoor/outdoor flooring, carpet) → Brian; window coverings → Dan. Noni may override per line. Default prices are expected to already be in Pricing Control.
3. **Approval to send** — `staff` (Noni) may send for signature on her own; no admin gate on manual prices.
4. **Data residency** — none required. SignWell confirmed as the provider; Supabase region unchanged.
5. **Second authorised buyer** — yes: a submission may carry a second buyer email with access to `/my-quote` and signing (Phase 3; schema: `buyer_selections.secondary_email` + RLS on either email).
6. **Changes after signing** — separate signed change order (each a new `quote_snapshot` with `purpose = 'change_order'`), never re-signing the whole sheet.

Consequence for Unit 24: the standard stair carpet is Luxor I; Windsor 8208 Catalyst is a different product line, so the $1,005 line is an upgrade by the buyer's choice, not a standard-colour dispute. Noni can state that at the 1:30 meeting; the line stays "Under review" only until Mike confirms he wants Catalyst.

## 12. AGENTS.md additions (one per phase, proposed)

- P1: "Bedroom premium carpet/underpad and stair carpet/underpad are priced by the engines via override keys `bedroomCarpet`, `bedroomUnderpad`, `stairCarpet`, `stairUnderpad`; editor toggles must exist for every priced flag."
- P2: "`quote_lines` is the system of record for anything priced, included, pending or deferred. Nothing outside `generateQuoteLines` and the console may write a price. Renderers read lines; totals are `SUM(amount) WHERE counts_in_total` + GST."
- P3: "Buyer-visible output reads only `client_visible` lines and `client_note`; `internal_note`, `sales_comments`, `admin_notes` never reach a buyer renderer or an AI prompt."
- P4: "Payments live only in `payments`; pipeline and PM payment fields are derived."

---

## Appendix A — Builder-check results (2026-11-18)

Reviewed as the builder (no subagent available to the fork). Questions raised, sorted:

**Answered in the document after the check**
- Where does the "Pending" vs "Not included in total" distinction render? → §6.1 rules.
- Does `included` render under "Not included"? → No; §8 P1 item 9 and §6.1.
- What happens to `area_upgrades`/`custom_pricing` after Phase 2? → Kept read-only for audit; `wizard_field` links lines back (§6.1, §5).
- Which function is the parity harness? → `audit-pricing-consistency`, extended (§6.4).

**Minor — settled as my calls**
- Snapshot granularity: one snapshot per send/sign/on-demand, not per edit (§6.8). *My call.*
- Status transitions are free-form for staff except `removed` requires a reason; buyers cannot change status (§6.7). *My call.*
- `staff` role cannot touch Pricing Control; everything else Noni needs is allowed (§6.9). *My call.*
- Phase 1 window lines use the existing custom-item mechanism rather than a new table, to avoid a throwaway migration (§8). *My call.*
- Daily digest time 08:00 CT; fallback window 4 hours; both are settings (§6.6). *My call.*

**Theirs** — see §11.
