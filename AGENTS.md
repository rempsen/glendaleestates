# Architecture rules

- Generate saved-submission PDFs through one fresh-record service and an explicit buyer-safe mapper; all download and preview paths must share it to prevent missing selections, stale notes, and inconsistent pricing.