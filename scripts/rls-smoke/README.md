# RLS smoke test (Phase 2 final fix wave, I5)

Executes the Phase 2 row-level-security rules against a **local** Supabase stack, with real JWTs, through PostgREST.
The migration tests (`scripts/migration-00*.test.ts`) only pin the SQL text; this proves the policies behave.

It cannot run in the build sandbox (no Docker). Run it on a workstation **before granting the staff role to a real
person** (runbook section 8, "Noni as staff").

## Run

```sh
supabase start                       # Docker; applies supabase/migrations (the Lovable base schema)
eval "$(supabase status -o env)"     # exports API_URL, DB_URL, ANON_KEY, SERVICE_ROLE_KEY
bun run rls-smoke
```

- Applies `drizzle/migrations/0006…0016` to the local database (each in a transaction; 0006's enum value first, on
  its own). Set `RLS_SMOKE_FROM=0000` if the local base schema lacks the drizzle 0000–0005 changes.
- Creates two buyers, one staff and one admin (Auth admin API, email confirmed), one itemised submission for buyer A
  and one un-itemised submission for buyer B.
- Refuses to run unless `API_URL` and `DB_URL` point at `localhost` / `127.0.0.1`. Never point it at production.
- `supabase stop --no-backup` afterwards discards everything it created.

## What it asserts

| Check | Rule |
|---|---|
| buyer A's `get_my_quote_lines` / `get_my_quote_header` return only A's submission | 0006 / 0012, JWT email match |
| buyer B cannot read A's reviews, lines, submission, or review A's line | 0006 RLS |
| `request_quote_change` refuses an un-itemised quote, works on an itemised one | 0012 itemise-first |
| `request_quote_change` accepts the caller's own `_submission_id`, refuses another buyer's (P0002) | 0012 shown submission |
| staff cannot write `pricing_config`, cannot read other `user_roles` rows | admin-only tables |
| staff cannot edit a buyer review | 0016 (staff SELECT only) |
| staff can add a document but cannot edit or delete a signed one | 0016 |
| a staff line edit stamps `updated_by` | 0016 trigger |
| the counted-hidden CHECK rejects a hidden priced line | 0010 |
| anon cannot execute `is_staff` | 0016 grants |

Exit codes: `0` all pass, `1` a check failed, `2` setup error or refused (not local).
