# Recoverly

**Win back retailer chargebacks before the clock runs out.**

Recoverly is a deductions workspace for suppliers selling to Walmart and Amazon. It audits every retailer deduction, scores how ready its dispute packet is, ranks the work by deadline risk, has AI explain each lost point, and keeps a person in charge of every money decision.

> **AI does the investigation. Humans make the call.**

Built by Team 5 for the Method hackathon (October 2026).

---

## The problem

Retailers deduct money from supplier invoices for shortages, late or wrong ASNs, pricing mismatches and compliance fines. Many deductions are wrong, but disputing them takes time: an analyst has to find the PO, invoice, bill of lading and proof of delivery, check that they agree, and file before a strict deadline. Teams fall behind, the window closes, and money that was owed is lost.

## What Recoverly does

| Question an analyst has | How Recoverly answers it |
| --- | --- |
| What should I work on first? | An alert queue ranked by priority, deadline and dollars across both retailers |
| Is this worth disputing? | A 100-point readiness score with a recommendation: submit, fix then submit, or accept and write off |
| Why is the score low? | Every lost point is shown with its reason, its fix, and how many points the fix recovers |
| How long do I really have? | Days left is the earliest of three clocks: the filing deadline, the carrier's proof retention, and the retailer's response deadline |
| What do I send? | AI drafts the dispute summary; the analyst edits it and approves a printable packet |
| Who signed off? | Role-based approvals and an activity log of every action with the score at that moment |
| Why do we keep losing? | Insights on past outcomes, top denial reasons, and dollars blocked by each fatal check |

## How it works

```
Data (mock retailer, carrier and warehouse records)
  -> Link every record to one case by PO number
  -> Gates: filing window open? attempts left? routed or human review?
  -> Readiness score: 8 checks, 100 points, fatal defects cap at 40
  -> Bands and priority: Ready / Needs work / Weak; Critical / High / Normal / Low
  -> AI explanation: why each point was lost, the fix, the owner
  -> Human decision: approve, request a document, write off, record the outcome
  -> Rescore when evidence changes; outcomes feed Insights
```

**Code calculates, AI explains, humans decide.** The database stores facts only. Scores are recomputed from those facts on every load, so fixing a document rescores the case instantly. The AI never changes a score.

### The readiness score

Every retailer code maps to a template with the same 8 lines and the same points. Labels change per code; points never do.

| # | Check | Points | Fatal |
| --- | --- | --- | --- |
| 1 | Required documents present | 35 | Yes |
| 2 | PO number matches | 8 | No |
| 3 | Ship-to matches (or the template's equivalent) | 8 | No |
| 4 | Stamp or signature present (or ASN sent before receipt, units visible, delivery confirmed) | 9 | Yes for most codes |
| 5 | Amounts reconcile exactly | 20 | Yes |
| 6 | Proof type fits prepaid or collect (or related claims grouped) | 5 | No |
| 7 | Deduction settled (or dispute summary written) | 5 | No |
| 8 | Prior denial addressed | 10 | No |

A fatal defect caps the displayed score at **40**, with the raw score and the reason shown beside it. Bands: **Ready 80-100, Needs work 50-79, Weak below 50**.

### Priority

- **Low:** under $250
- **Critical:** 7 days or fewer left
- **High:** 30 days or fewer, or $2,500 or more
- **Normal:** everything else

### Roles

| User | Role | Can do |
| --- | --- | --- |
| Priya Shah | Deductions analyst | Approve packets, request documents, add evidence, write off up to $1,000, request larger write-offs |
| Marcus Lee | AR manager | Approve or reject write-offs over $1,000 |
| Dana Ortiz | Logistics | Receives document requests |
| Sam Patel | Sales | Receives document requests |

The person who requests a write-off over $1,000 cannot also approve it. All rules are enforced on the server.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| App | TanStack Start (React 19, TypeScript, Vite), Tailwind CSS v4, shadcn/ui, Recharts |
| Database | Supabase (Postgres), 16 tables, read-only to the browser |
| Writes | TanStack server functions using the Supabase service role key |
| Scoring | `src/lib/scoring.ts`, pure functions, covered by 40 case tests |
| AI | Google Gemini via `@google/genai`, with retry, a backup model, and saved responses for the demo cases |
| Files | Mock evidence in `public/evidence/`; uploads in Supabase Storage |
| Hosting | Vercel |

## About the data

All data is fictional: one supplier (Brightleaf Snacks Co.), 40 deductions worth $63,901 (24 Walmart, 16 Amazon), 32 evidence files marked "mock document", and 12 past outcomes. Retailer rules (codes, filing windows, attempt limits) come from public supplier-education sources and are linked per rule in `code_mappings`; anything unconfirmed is flagged `verified = false` and shows a warning in the app. `mock-backend/data/case-catalog.csv` lists what the app should show for every case.

## Limitations

- No live retailer, carrier or ERP connections; data is mock.
- Document fields are pre-extracted and labeled "AI-read, please verify" rather than read from files live.
- Walmart and Amazon only.
- Point values and the cap at 40 are design choices; the order of the checks follows supplier research.
