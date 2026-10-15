# Retailer Resolve: project guide for Claude Code

Hackathon prototype (Method hackathon, Team 5). Demo is **Friday 2026-10-16**.
A workspace for a supplier's deductions team: it audits retailer deductions, scores how ready
each dispute packet is, alerts on deadlines, explains lost points with AI, and keeps a human in
charge of every money decision. Pitch line: **"AI does the investigation, humans make the call."**

## Stack
- TanStack Start (React 19, TypeScript, Vite), Tailwind v4, shadcn/ui. Not Next.js.
- Supabase (our own project). Client: `src/integrations/supabase/client.ts`, env in `.env.local`.
- AI layer: Google Gemini via `@google/genai`. Server only: `GEMINI_API_KEY`, `GEMINI_MODEL` and
  `GEMINI_FALLBACK_MODEL` (never `VITE_`-prefixed), read in the `explainCase` server function
  (`src/lib/explain-case.ts`). Attempts share a 20 s budget: primary model, one retry after 1.5 s on
  503/429/timeout, then the fallback model once. If all fail, the saved reply in `src/lib/ai-cache.ts`
  answers. Regenerate the cache with `npm run ai:cache`.
- Hosting: Vercel (nitro `vercel` preset already set in `vite.config.ts`).
- Lovable is no longer used for editing. Keep `@lovable.dev/vite-tanstack-config` in `vite.config.ts`
  (it is just the build config); do not add plugins it already includes.

## Where things live
- `mock-backend/`: the mock data package. `supabase/*.sql` (schema + seed), `data/case-catalog.csv`
  (expected result per case: use it to check screens), `ai/explain-prompt.md` (AI prompt),
  `test/run-tests.ts` (engine tests).
- `src/lib/scoring.ts`: **the scoring engine. Source of truth for score, band, cap, days left,
  priority, recommendation, warnings.** Pure functions. Do not reimplement any of this in UI code.
- `src/lib/chargebacks.ts`: loads all tables from Supabase and returns `{ scored, queue }`.
  Hook: `useChargebacks()`. Evidence URLs: `evidenceUrl(storage_path)` -> `/evidence/...`.
- `public/evidence/`: the mock evidence files (PODs, BOLs, ASN files, photos).
- `src/lib/ai-explain.ts`: the Gemini call, reply validation and cache fallback. `scripts/generate-ai-cache.ts`: writes the cache.
- Evidence: `src/lib/evidence.server.ts` (add or replace a document, then rescore). `scoring.ts` reads only the first evidence row of each doc type, so a new document replaces the existing row; it is inserted only when none exists. Uploads go to the `evidence` bucket at `<case id>/<doc>-<timestamp>.<ext>`. `evidenceUrl()` serves `evidence/...` paths from `public/evidence/` and everything else from the bucket.
- Decisions: `src/lib/decision-rules.ts` (who can do what; shared by server and UI). `src/lib/decisions.ts`: server functions (`takeCaseAction`, `resetDemo`). `src/lib/decisions.server.ts`: the only file that uses `SUPABASE_SERVICE_ROLE_KEY`; never import it from client code.
- `src/lib/data.ts`, `src/lib/store.ts`: Lupe's original mock data (5 retailers, QuickBooks).
  **Being replaced** by the Supabase data. Do not add new features on top of them.

## Rules
1. Scores come only from `scoring.ts`. The AI explains points and drafts text; it never changes a score.
2. "Today" is `settings.demo_today` (2026-10-16), never `new Date()`, so countdowns match the demo.
3. Retailers in scope: **Walmart and Amazon only.** Hide Target, Kroger, Costco, Whole Foods, QuickBooks.
4. Reads use the publishable key from the browser. **All writes go through TanStack server functions
   (`createServerFn`) using `SUPABASE_SERVICE_ROLE_KEY`**, which must never be imported in client code
   or prefixed with `VITE_`.
5. Every human action writes a row to `audit_log` (actions: approved, write_off_requested,
   write_off_approved, requested_document, evidence_added, rescored, outcome_recorded, override).
6. Write-offs above `settings.manager_approval_write_off_above` ($1,000) need the manager role.
7. Label all AI text "AI-suggested, review before sending".
8. Supabase returns numeric columns as strings: wrap money in `Number()`.
9. Reuse existing styles: `panel`, `eyebrow`, `num`, `input`, `btn-primary`, `btn-outline`, `btn-ghost`,
   `chip-*`, and the components in `src/components/ui/`.
10. Small, reviewable changes. Work on a branch; never force-push.

## Users (from `app_users`, demo role switcher, no real login)
- Priya Shah, deductions_analyst (default) · Marcus Lee, ar_manager · Dana Ortiz, logistics · Sam Patel, sales

## Demo hero cases (must always work)
- **WMT-001**: $4,800 Walmart shortage, POD unstamped -> raw 91 capped to 40, Weak, Critical, 6 days
  (carrier proof expires). Story: request stamped POD, add it, rescore to 100, approve.
- **AMZ-001**: Amazon ASN Accuracy, 100, Ready, Critical, 5 days. Story: approve in one click.
- **WMT-017**: $112 Walmart pricing, deduction is valid -> accept and write off.

## Checking work
- `node --experimental-strip-types mock-backend/test/run-tests.ts` must print `40 checks passed; 0 failed`.
- Screens must match `mock-backend/data/case-catalog.csv` (score, band, priority, days left, recommendation).
- `npm run build` must pass before pushing.
