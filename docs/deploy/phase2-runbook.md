# Phase 2 deploy runbook — quote lines, console, notifications, e-sign, QBO estimate

Branch `phase2-quote-lines` → `main`. Supabase project `adtbjnwaxmxhyjkjxqoz` (`supabase/config.toml`).
Lovable syncs the frontend from GitHub; edge functions deploy on merge. Steps are in order; do not skip the
checks between them.

## 1. Migrations

Applied by hand through the Lovable DB connection, each in one transaction, followed by its journal row in
`drizzle.__drizzle_migrations` (`hash` = sha256 of the `.sql` file, `created_at` = the journal `when`).

| # | File | Journal `when` | sha256 | Prod status |
|---|---|---|---|---|
| 0006 | `0006_quote_lines.sql` | 1795200000000 | `352b63416b9062751ccacc0a8869f99e6ea3c030d2f4db8d421b34e7c5fa1230` | APPLIED (ALTER TYPE run as its own statement first) |
| 0007 | `0007_seed_unit_base_spec.sql` | 1795300000000 | `8c65cb8c4e4522f40f9b8f9e404514e9c11378d8e43cd6ad20371124ddaaca76` | APPLIED |
| 0008 | `0008_quote_lines_realtime.sql` | 1795400000000 | `044300b2b4e9c8be332fd756153345873d0830c73fb9fa7cdc83b0d809dd5d53` | APPLIED |
| 0009 | `0009_staff_directory.sql` | 1795500000000 | `098595cb0a6c1402e910085e5092d39cebae879eb42db158875cf4f21e8606c4` | APPLIED |
| 0010 | `0010_counted_lines_visible.sql` | 1795600000000 | `ac2d43fbd29a993074eddd345e39e04f60529cb793a2d44f611054661653d8e6` | APPLIED |
| 0011 | `0011_portal_settings_notifications.sql` | 1795700000000 | `bf923f6cc545e33f23df83dfc1ec71e0f7595fb9e55952a787e5469b96b7fd35` | APPLIED |
| 0012 | `0012_buyer_change_request.sql` | 1795800000000 | `a0d373ad547b4f03ad17b0b75d66599164b427d25c47199eed498a7d119ae6b2` | **PENDING — needs Dan's explicit approval** |
| 0013 | `0013_esign_settings.sql` | 1795900000000 | `d2d2a5830e9c5011097eddf5a8edf277b80b25d3a0ef8f4eb896adaf3440d72c` | PENDING |
| 0014 | `0014_staff_audit_log.sql` | 1796000000000 | `35bbd849a2c51d3ea5963dc30078a5b79bd589a72195620a4a40a768196fa221` | PENDING |
| 0015 | `0015_ai_settings.sql` | 1796100000000 | `b8772b49e6b2197d73c237d4fd4d215d4a8066c4bf8c4f8ae049775e294e1ff2` | PENDING |

Recompute before inserting: `sha256sum drizzle/migrations/00{12,13,14,15}_*.sql`.

Journal row, per migration (after the migration's own transaction commits):

```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<sha256>', <when>);
```

Notes:
- **0012 creates SECURITY DEFINER functions** (`get_my_quote_header()`, `request_quote_change(text)`) and replaces
  the `pricing_queue` view. It was refused by the automation classifier and needs Dan's explicit "yes, apply 0012".
  Without it `/my-quote` cannot load its header and buyer change requests fail.
- 0013 adds e-sign `portal_settings` keys (`ON CONFLICT DO NOTHING`). Before the first send, verify
  `documents.provider` has no column default (the send claim uses `provider IS NULL`).
- 0014 adds two staff policies on `submission_audit_logs` (SELECT; INSERT of own rows, never
  `pricing_request_notified`). Admin policies are untouched.
- 0015 adds `ai_monthly_token_cap` (default 2,000,000).
- Verify after each: `select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 5;`

## 2. Edge functions to deploy

Every function directory changed since `main`:

`audit-pricing-consistency`, `esign-webhook`, `manage-users`, `notify-pricing-request`, `pricing-digest`,
`qbo-sync-submission`, `resend-confirmation-email`, `resend-corrected-summary`, `send-for-signature`,
`send-selections-email`, `summarize-upgrade-requests`, `sync-hubspot`.

`_shared/` changed too. `send-draft-reminder`, `send-user-notification` and `setup-hubspot-properties` bundle
`_shared/internalAuth.ts` (additive change: `authorizeStaffOrAdmin`); redeploy them so every function runs the same
shared code. `verify_jwt` per function is in `supabase/config.toml` (`notify-pricing-request`, `pricing-digest`,
`send-for-signature`, `esign-webhook`, `qbo-sync-submission` are `false` and gate in-function).

Publish the frontend in Lovable right after the merge (the wizard, console and `/my-quote` depend on the new
functions).

## 3. Secrets

**GitHub Actions** (repo → Settings → Secrets and variables → Actions), for `.github/workflows/pricing-digest.yml`:
- `SUPABASE_URL` — `https://adtbjnwaxmxhyjkjxqoz.supabase.co`
- `INTERNAL_SECRET` — a long random string; the same value as the edge secret below.

**Supabase edge-function secrets** (Edge Functions → Secrets):
- `INTERNAL_SECRET` — same value as the GitHub secret; required by `pricing-digest` (unset = every call refused).
- `SIGNWELL_API_KEY` — SignWell → Settings → API → API key.
- `SIGNWELL_WEBHOOK_SECRET` — the **Webhook ID** SignWell returns when the webhook (section 5) is created; the
  dashboard's webhook list shows the same ID.
- `SIGNWELL_TEST_MODE` — leave unset or `true`; set `false` only to send real, billable documents.
- Optional `PORTAL_BASE_URL` (default `https://glendaleestates.lovable.app`).
- Already present: `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Never put SignWell secrets in `portal_settings`.

## 4. Database Webhook for `notify-pricing-request`

Supabase → Database → Webhooks → Create a new hook (after 0011 is applied and the function is deployed):

| Field | Value |
|---|---|
| Name | `notify_pricing_request` |
| Table | `public.quote_lines` |
| Events | Insert, Update (not Delete) |
| Type | Supabase Edge Functions |
| Edge Function | `notify-pricing-request` |
| Method | `POST` |
| Timeout | `5000` ms |
| HTTP headers | `Content-Type: application/json`; `Authorization: Bearer <service role key>` ("Add auth header with service key") |

The hook fires on every line insert/update (autosaves included); the function returns "skipped" quickly for lines
that are not newly flagged. Dashboard webhooks cannot filter by column.

## 5. SignWell webhook

SignWell → Settings → API → Webhooks → add:
- URL: `https://adtbjnwaxmxhyjkjxqoz.supabase.co/functions/v1/esign-webhook`
- Events: Document Completed, Document Declined, Document Canceled, Document Expired (Viewed/Signed are ignored).
- Copy the Webhook ID into `SIGNWELL_WEBHOOK_SECRET`.

Still to verify on the first test-mode run: create-document field names (`with_signature_page`,
`embedded_signing`, `recipients[].embedded_signing_url`) and the `GET /documents/{id}` status strings.
Smoke test: console → Documents → Send for signature → sign → document shows `signed`, Download opens the signed
PDF, unit status moves to `completed` (or `esign_status_after_signed`).

## 6. Teams Workflows (Dan)

1. In Microsoft Teams, open the channel that should get pricing requests → `…` → **Workflows**.
2. Choose the template **"Post to a channel when a webhook request is received"**, keep the team and channel, and
   finish the wizard.
3. Copy the URL it shows (it ends in `…/workflows/…/triggers/manual/paths/invoke?…`).
4. In the portal open **Admin → Settings → Notifications** (`/admin/settings/notifications`) → **Pricing requests**,
   paste the URL into the Teams webhook field, add Brian to the digest recipients, and **Save**.
5. Press **Send test card**. A card should appear in the channel within a minute; the response says
   `channel: 'teams'`. If it says `resend`, the URL was rejected and the email fallback was used.

## 7. QuickBooks reconnect

The stored refresh token expired on 2026-08-15; every sync fails until this is done.
1. Deploy `qbo-sync-submission` and publish the frontend.
2. As an admin open **Admin → Settings → QuickBooks** (`/admin/settings/quickbooks`); the red "Reconnect QuickBooks"
   banner shows.
3. **Reconnect QuickBooks** → sign in to Intuit → choose the BMD company → approve. Back on the page: "QuickBooks
   connected" toast, banner gone. If Intuit rejects the redirect, add
   `https://adtbjnwaxmxhyjkjxqoz.supabase.co/functions/v1/qbo-oauth-callback` to the app's Production Redirect URIs.
4. Confirm settings on the same page: default income account, tax code GST 5%, auto-create items on, SKU prefix
   `GLEN-`.
5. Test with one unit whose lines are all priced: set its status to **quoted**; the Estimate total in QuickBooks
   must match the console total (sync log: `expected_total`, `qbo_total`, `total_mismatch`,
   `amount_sum_mismatch`). A 409 "quote has unpriced lines" lists the lines to price or resolve first (Unit 24's
   stairs line is `under_review` and blocks its sync until resolved).

## 8. Noni as staff (when Dan approves)

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'staff' FROM auth.users WHERE lower(email) = lower('<noni email>')
ON CONFLICT DO NOTHING;
```

Run it as its own statement, after 0014. If Noni already holds `admin` and Dan wants her limited to staff, also:

```sql
DELETE FROM public.user_roles
WHERE role = 'admin' AND user_id = (SELECT id FROM auth.users WHERE lower(email) = lower('<noni email>'));
```

PM hub, Pipeline and Sales Analytics stay admin-only (their tables are admin-only under RLS).

## 9. Backfill `quote_lines` (`--write`)

Prerequisites: 0006–0011 applied (done); Dan has signed off the dry run per unit and Unit 7's +$451.20.

1. **Decide Unit 24 first.** The live row has `additional_windows_qty = 2` *and* the two itemized office shades
   (Living Room, Front Entrance, $673.50 each), so it double-counts $1,347 (11,735.40 vs 10,388.40). Either set
   `additional_windows_qty` back to 0 or remove the two custom items — Dan picks.
2. **Re-run the dry run** after that change and after this branch is deployed. Since Task 18 itemized office
   shades are window coverings, so Unit 24's `windows_lines` differs from
   `/home/claude/prod-snap/backfill-dryrun-2026-11-18.json` (7,998.00 there) and a write against the old file
   would FAIL Unit 24 with "differs from signed-off report". The report no longer has `engine_*` columns; the
   sign-off check reads `lines_subtotal`, `windows_lines`, `counted_lines`, `not_in_total`.
   ```sh
   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… bun scripts/backfill-quote-lines.ts --json > dryrun-<date>.json
   ```
   Get Dan's sign-off on that file.
3. **Write:**
   ```sh
   CONFIRM_BACKFILL=yes SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
     bun scripts/backfill-quote-lines.ts --write --expect /home/claude/prod-snap/backfill-dryrun-2026-11-18.json
   ```
   Use the re-signed file from step 2 in place of the 2026-11-18 file if Unit 24 changed (or pass `--unit` to
   write the other eight against the old file first). Exit codes: 0 ok; 1 a row FAILed (nothing wrong written);
   2 refused / runtime error; 3 rollback failed — clean up with
   `DELETE FROM quote_lines WHERE submission_id = '<id>' AND source = 'migration'` and re-run the dry run.
4. Re-running is safe: submissions that already have lines are `skipped: has lines`.

## 10. Post-deploy checks

- **Drift harness, 0 drift on all 9 units.** Right after the backfill:
  ```sh
  curl -sS -X POST "$SUPABASE_URL/functions/v1/audit-pricing-consistency" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H 'Content-Type: application/json' -d '{}'
  ```
  Expect `audited: 9, okCount: 9, driftCount: 0, noLinesCount: 0, errorCount: 0`. It compares stored lines with
  lines freshly generated from each `buyer_selections` row (there is no `mode` parameter any more). Later, a
  `drift` row is expected wherever staff edited lines in the console.
- **HubSpot values jump once.** `sync-hubspot` now sends line sums; the next sync replaces the old values on every
  deal. Tell Dan/Brian before the first sync.
- **Export columns changed.** The flat export has a "Quote Lines" section; the old per-charge `$` columns are gone.
  Spreadsheets keyed to the old columns need updating.
- **Buyer email no longer prints `sales_comments`** (spec §6.15). If buyers typed their own notes there, a
  buyer-labelled field is Phase 3.
- **Unit 24 split.** Windows $7,998 / Upgrades $2,390.40 on the fixture data (subtotal 10,388.40 unchanged);
  tell Dan the itemized shades moved from Upgrades to Window coverings.
- **Office pricing moved.** The editor no longer has the Office Pricing & Custom Line Items panel; overrides,
  custom lines, window locations, Client preview and the staff Word copy are in the quote console.
  `custom_pricing` is read-only; its follow-ups still print but are not editable anywhere yet.
- Pending line → Teams within 1 minute (flag a test line in the console); daily digest (run the workflow by hand:
  Actions → Pricing digest → Run workflow) shows open requests and "Buyer responses since yesterday".
- `bun test`, `deno test supabase/functions/` green on `main` after the merge.

## 11. Unit 24 walkthrough (Mike's 12 corrections)

_Placeholder — the controller fills this in after deploy: run on a copy of Unit 24 in the console, record each
correction, the line it changed, the running total before/after, and the time taken._
