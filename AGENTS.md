# Architecture rules

- Generate saved-submission PDFs through one fresh-record service and an explicit buyer-safe mapper; all download and preview paths must share it to prevent missing selections, stale notes, and inconsistent pricing.- Office price overrides and custom line items live in `buyer_selections.custom_pricing` and are applied only inside `computeUpgradeTotals` (client) and `computeUpgradeTotalsServer` (edge); every caller must pass `customPricing` so UI, PDFs, exports, PM and QuickBooks totals stay identical.
