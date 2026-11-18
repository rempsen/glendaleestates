# Task 5 report: Editor save integrity

## Implemented
- New pure module `src/lib/submissionUpdatePayload.ts`: exports `SubmissionEditState` (moved from editor's `BuyerSelection`), `AreaUpgrade` (now with optional `areaLabel`), and `buildSubmissionUpdatePayload(editData): TablesUpdate<'buyer_selections'>`.
- `SubmissionEditor.tsx`: `type BuyerSelection = SubmissionEditState`; `handleSave` calls the builder and writes the result unchanged; local-state merge no longer overrides `heated_floor_bathrooms`.
- Fix 1: `heated_floor_bathrooms` passes through `editData.heated_floor_bathrooms` (no derivation from area rows).
- Fix 2: area rows are `{...upgrade, heatedFloor, manualPrice, manualPriceNote}` so `areaLabel` and other keys survive.
- Added `stair_upgrade_type?` to the state type, removing the `(editData as any)` cast.
- `calculateHeatedFloorCount` kept: it still drives the display badge (~line 842), not the payload.

## Payload fields before vs after
Identical set (all 38 keys, incl. `premium_carpet_bedroom`, `premium_underpad_bedroom`, `stair_upgrade_type`, `stair_premium_carpet_selected`, `premium_underpad_stairs`, `custom_pricing`, `upgrade_interests`). Only value changes: `heated_floor_bathrooms` (derived count -> pass-through) and `area_upgrades` rows (fixed key list -> spread, extra keys kept).

## TDD
- RED: `bun test scripts/editor-payload.test.ts` -> "Cannot find module ../src/lib/submissionUpdatePayload", 0 pass / 1 fail.
- GREEN: 3 pass (Unit 37 heated=2 kept; areaLabel retained + manualPrice/heatedFloor/manualPriceNote normalised; has_stairs=false forces stair carpet/underpad/LVP off, type 'standard').
- Full: `bun test` 52 pass / 10 files; `bunx tsc --noEmit -p tsconfig.app.json` clean.

## Files
- A `src/lib/submissionUpdatePayload.ts`, A `scripts/editor-payload.test.ts`, M `src/components/admin/SubmissionEditor.tsx`

## Self-review
- Builder is pure (only a type import). handleSave writes the builder output unchanged.
- Stair carpet/underpad switches (editor lines ~665/672) sit inside the `{editData.has_stairs && (` block (~615); no UI change.
- Audit log `newData` still overrides `area_upgrades` with the raw editData rows (pre-existing).

## Concerns
- Existing `heatedFloor` flags on area rows no longer influence the saved count; until Task 6 adds a count input, staff cannot change it from the editor. Display badge still shows the row-derived count, which may differ from the saved value.
