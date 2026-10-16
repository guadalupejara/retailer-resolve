# Dispute Readiness + Claim Alerts: mock backend

Mock data, database schema and scoring engine for the hackathon prototype.
Two features: a **readiness score** for each dispute packet, and **deadline alerts** across retailers.
Retailers: Walmart and Amazon. Demo date is frozen at **Friday 2026-10-16**.

Everything here is fictional: the supplier (Brightleaf Snacks Co.), people, PO numbers, amounts
and documents. Retailer rules come from public supplier-education sources (linked per rule).
Anything not sourced is flagged `verified = false` and surfaces as a warning in the app.

## What's inside

| Path | What it is |
|---|---|
| `supabase/schema.sql` | 16 tables, read-only RLS policies for the demo |
| `supabase/seed.sql` | All mock rows (40 cases, 32 evidence files, rule pack) |
| `supabase/storage.sql` | Creates the `evidence` storage bucket (Supabase only) |
| `src/scoring.ts` | The engine: readiness score, cap, bands, clocks, priority, recommendation, queue order |
| `src/load-from-supabase.ts` | Example loader for a Next.js server component |
| `evidence/` | The files analysts look at: POD/BOL/confirmation/claim PDFs, EDI 856 text, carton photo placeholders |
| `data/case-catalog.csv` | One row per case: what it tests and what the UI should show. **Start here.** |
| `data/seed.json`, `data/csv/` | Same data as JSON and CSV (for Cursor/Claude Code context or CSV import) |
| `test/run-tests.ts` | Checks all 40 cases produce their designed outcome, plus coverage of every use case |
| `ai/explain-prompt.md` | Prompt for the AI explanation layer |
| `generator/` | Python that produces all of the above. Edit `CASES` in `generate.py` to change data. |

## Set up (about 15 minutes)

1. Create a Supabase project. In **SQL Editor**, run `schema.sql`, then `seed.sql`, then `storage.sql`.
2. Upload evidence: drag the *contents* of `evidence/` into the `evidence` bucket
   (paths must stay like `WMT-001/pod.pdf`), or run `scripts/upload-evidence.mjs` with your service-role key.
3. In your Next.js app add `src/scoring.ts` and `src/load-from-supabase.ts`;
   set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.
4. Writes (approve, write off, record outcome, add evidence) go through a server route using
   `SUPABASE_SERVICE_ROLE_KEY`. Never expose that key to the browser.

## How scoring works

- Each code maps to a **template** with 8 lines worth **35 / 8 / 8 / 9 / 20 / 5 / 5 / 10 = 100**.
  Labels change per template; points never do.
- **Score = points earned.** A line that doesn't apply (e.g. "prior denial" on a first dispute) counts as earned.
- **Fatal defect → displayed score is 40**, with the raw total shown beside it and the reason.
- Bands: **80–100 Ready, 50–79 Needs work, below 50 Weak.**
- Gates before scoring: filing window still open; attempts left (Amazon allows 2). Codes with no template go to
  human review; OTIF fines are routed to HighRadius or the buyer.

Templates: `shortage_wmt` (Walmart 22/24/25), `shortage_amz` (Amazon PQV), `pricing_wmt` (Walmart 11),
`asn_amz` (ASN Accuracy), `carton_amz` (Carton Content Accuracy). Fallback: Walmart 87, unmapped Amazon types.

## How alerts work

- **Days left = earliest of three clocks:** filing deadline; carrier proof expiry (only when the carrier document
  is missing or flawed, since you'd need to request a new copy); retailer response due (Walmart gives 7 days).
- **Priority:** below $250 → Low; ≤ 7 days → Critical; ≤ 30 days or ≥ $2,500 → High; otherwise Normal.
- **Queue order:** priority, then dollars (high first), then score (weak first).

## The 40 cases

| Use case | Cases |
|---|---|
| **Hero 1**: unstamped POD, $4,800, 6 days, raw 91 → capped 40 | WMT-001 |
| **Hero 2**: Amazon ASN on time, 5 days left, 100, one-click approve | AMZ-001 |
| **Hero 3**: invoiced above PO price, $112 → accept and write off | WMT-017 |
| Ready / Needs work / Weak (capped) | 14 / 6 / 14 |
| Uncapped with points lost (raw score shown as-is) | WMT-003 (92), WMT-005 (79), WMT-015 (82), AMZ-009 (77)… |
| Boundary days: 7 / 8 / 30 / 31 | WMT-011, AMZ-013 / WMT-014, AMZ-008 / WMT-015 / WMT-016 |
| Boundary score: exactly 80 before cap, 79 uncapped | WMT-013, WMT-019 / WMT-005, WMT-010, WMT-014 |
| Evidence expiry earlier than filing deadline | AMZ-013 (2-year window, proof gone in 7 days), WMT-001, WMT-011… |
| Retailer response clock (7 days, 2 left) | WMT-021 |
| Expired / final (2 attempts used) | WMT-022, AMZ-005 / AMZ-006 |
| Routed (OTIF) / human review | WMT-024 / WMT-023, AMZ-016 |
| Re-dispute fixed / not fixed | WMT-006, AMZ-011 / WMT-007, WMT-015, AMZ-008, AMZ-009 |
| Last-attempt warning (Amazon) | AMZ-008, AMZ-009, AMZ-011 |
| Wrong proof type (collect with POD only) | WMT-004 |
| Illegible scan | WMT-009 |
| Amount off by cents | WMT-013 |
| Likely-valid deductions | WMT-017, AMZ-002 (ASN late), AMZ-015 (carrier shows short) |

Full list with expected values: `data/case-catalog.csv`.

## Check it

```bash
python3 generator/generate.py && python3 generator/make_evidence.py
node --experimental-strip-types test/run-tests.ts   # Node 22+
```

Verified before handoff: all 40 cases match their expected outcome; every use case above appears;
`schema.sql` + `seed.sql` load into Postgres 16 without errors; rows read back from the database
score identically to `seed.json`; `scoring.ts` passes `tsc --strict`.
Not verified: the Supabase-specific `storage.sql`, the upload script, and the loader against a live project.

## Assumptions to state if asked

- Point values and the 40 cap are design choices; the ordering follows the research, the numbers don't come from it.
- Fatal with `fatal_verified = false`: Amazon "carton opened" and "delivery confirmed".
- Amazon shortage window: 2 years used (SPS, 2025); ChannelEngine says 30 days. Flagged as unverified.
- Walmart OTIF window (30 days) and carrier retention days (60/90/120) are mock values.
- "Normal" priority was added for cases that are neither urgent nor small.
