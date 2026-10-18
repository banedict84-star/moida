# CRM capacity: 50,000 contacts

The contact and Sheets merge limit is 50,000. Existing JSON and gzip fields remain readable. Small address books still use the original Firestore field. Large address books store immutable, SHA-256 checked gzip chunks in account-scoped D1 rows, with a small manifest in the existing Firestore members field. The manifest is only replaced after every upload succeeds. Editing one record normally changes one chunk. Chunk bytes are capped at 500 KB, raw member data at 200 MB, and stored chunks per account at 200 MB. Photos still use the existing resize step; this is a contact capacity target, not unlimited attachment storage.

Old unreferenced chunks are eligible for cleanup after 24 hours. Cleanup obtains the authoritative manifest from Firestore with the caller's existing credential, protects active Sheets baseline/pending pointers, and never deletes another account's chunks. Failed cleanup does not fail a successful contact save.

The browser renders at most 100 table rows and uses its existing search worker. IndexedDB retains a pending full snapshot when localStorage is full. Account-specific cache keys are preserved. Bulk apply indexes IDs and saves organization metadata once rather than writing a growing cache once per contact.

Sheets uploads use a compressed manifest rather than one oversized contacts POST. Baselines and pending jobs use compressed, chunked D1 payloads. Reads use at most 5,000 rows per range, writes at most 2,500 rows and approximately 1 MB per request. Only changed blocks are written. Each block is checked against its pre-write hash, and a final full comparison precedes advancing the baseline. A failure can leave already transmitted blocks in Sheets; the next explicit/automatic sync compares both sides again. No silent conflict resolution or deletion is introduced. Long jobs renew a 15-minute lease and report progress.

Validation:
- node --test tests/crm-storage.test.mjs tests/crm-scale.test.mjs tests/crm-chunks.test.mjs tests/crm-sheets.test.mjs tests/crm-sms-history.test.mjs tests/crm-reset.test.mjs
- node tests/crm-scale-browser.mjs (requires Playwright and installed Chrome; MOIDA_PLAYWRIGHT_MODULE can point to a local package)

The scale tests use synthetic contacts and a SQLite-backed D1 adapter with simulated Sheets ranges; they are not a 50,000-contact production load test. The browser smoke test verifies actual rendering, search, last-page navigation and IndexedDB restoration. Real server quotas, phone memory, network speed, photographs and very long fields still affect capacity and latency. Existing production contacts are not replaced with test data.

Opt-in derived fields: sheet-level developer metadata moida_crm_derived=address_rrn_v1 enables same-address-and-unit registration counts (including self), resident-number full ages as of the Korean calendar date, and decade age bands on sync. Unknown addresses and ambiguous/invalid birth dates remain blank. Results are numeric cells for age/count, not native Sheet formulas; recalculation runs with the existing CRM sync, not while the app is closed. Other fields retain three-way conflict protection. Automatically derived age and address counts are display data and do not add demographic/household score weights.
