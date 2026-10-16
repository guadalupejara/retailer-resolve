// The AI layer. Gemini explains the engine's points and drafts text; it never changes a score.
// Shared by the explainCase server function (src/lib/explain-case.ts) and the cache script
// (scripts/generate-ai-cache.ts), so both run exactly the same path.
import { GoogleGenAI } from "@google/genai";
import { bundleFor, parseSettings, scoreCase, type CaseResult, type Evidence, type SeedLike } from "./scoring";

export interface AiFix {
  line_no: number;
  why: string;
  fix: string;
  owner: string;
  effect: string;
}

export interface AiExplanation {
  headline: string;
  summary: string;
  fixes: AiFix[];
}

/** What the UI may show. Error text never leaves the server; it is logged instead. */
export type AiOutcome =
  | { mode: "live"; path: "primary" | "backup"; explanation: AiExplanation }
  | { mode: "cached"; explanation: AiExplanation }
  | { mode: "unavailable" };

export interface ExplainInput {
  seed: SeedLike;
  id: string;
  /** The "System prompt" section of mock-backend/ai/explain-prompt.md. */
  systemPrompt: string;
  apiKey: string | undefined;
  model: string | undefined;
  fallbackModel: string | undefined;
  /** Used only when every live attempt fails. The cache script passes {} so it never falls back. */
  cache: Record<string, AiExplanation>;
  /** Total time for all attempts together. */
  budgetMs?: number;
  retryDelayMs?: number;
  log?: (message: string) => void;
}

const DEFAULT_BUDGET_MS = 20_000;
const DEFAULT_RETRY_DELAY_MS = 1_500;
/** Thinking off. thinkingLevel MINIMAL is rejected by gemini-3.8-flash; budget 0 is accepted. */
const THINKING = { thinkingBudget: 0 };

class BadReplyError extends Error {}
class TimeoutError extends Error {}

/** Pulls the system instruction out of the prompt doc, so the doc stays the source of truth. */
export function extractSystemPrompt(md: string): string {
  const start = md.indexOf("## System prompt");
  const end = md.indexOf("## Demo reliability");
  if (start < 0 || end < 0) throw new Error("explain-prompt.md has no 'System prompt' section");
  return md.slice(start + "## System prompt".length, end).trim();
}

/** Case facts sent with the engine result. Money is numeric here (not Supabase strings). */
function casePayload(seed: SeedLike, id: string, result: CaseResult) {
  const b = bundleFor(seed, id);
  const d = b.deduction;
  return {
    case: {
      id, title: d.title, retailer_id: d.retailer_id,
      code: b.mapping.code, code_name: b.mapping.code_name,
      amount: Number(d.amount), dispute_amount: Number(d.dispute_amount),
      po_number: d.po_number, invoice_number: d.invoice_number,
      pro_number: b.shipment?.pro_number ?? null, carrier: b.carrier?.name ?? null,
      terms: b.shipment?.terms ?? null,
      status: d.status, attempts_used: d.attempts_used, attempt_limit: b.mapping.attempt_limit,
    },
    scoring: result,
    evidence: b.evidence.map((e) => {
      const row = e as Evidence & { variant?: string | null };
      return { doc_type: row.doc_type, variant: row.variant ?? null, extracted: row.extracted };
    }),
    dispute_history: b.history,
  };
}

/** Accepts the reply only if it has the shape the UI renders. Anything else is an invalid reply. */
export function parseExplanation(text: string): AiExplanation {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    throw new BadReplyError("invalid JSON");
  }
  const o = (v ?? {}) as Record<string, unknown>;
  if (typeof o["headline"] !== "string" || typeof o["summary"] !== "string" || !Array.isArray(o["fixes"])) {
    throw new BadReplyError("JSON is missing headline, summary or fixes");
  }
  const fixes: AiFix[] = o["fixes"].map((f: unknown) => {
    const x = (f ?? {}) as Record<string, unknown>;
    if (typeof x["line_no"] !== "number" || typeof x["why"] !== "string" || typeof x["fix"] !== "string"
      || typeof x["owner"] !== "string" || typeof x["effect"] !== "string") {
      throw new BadReplyError("a fix entry is missing a field");
    }
    return { line_no: x["line_no"], why: x["why"], fix: x["fix"], owner: x["owner"], effect: x["effect"] };
  });
  return { headline: o["headline"], summary: o["summary"], fixes };
}

/** One Gemini call. The signal aborts the request when the attempt's time runs out. */
async function callGemini(
  apiKey: string, model: string, systemPrompt: string, payload: unknown, timeoutMs: number,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await ai.models.generateContent({
      model,
      contents: JSON.stringify(payload, null, 2),
      config: { systemInstruction: systemPrompt, responseMimeType: "application/json", thinkingConfig: THINKING, abortSignal: ac.signal },
    });
    if (!res.text) throw new BadReplyError("empty reply");
    return res.text;
  } catch (e) {
    if (ac.signal.aborted) throw new TimeoutError(`no reply within ${timeoutMs} ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** 503, 429 and timeouts get one retry on the same model. Anything else goes to the backup model. */
function isRetryable(e: unknown): boolean {
  if (e instanceof TimeoutError) return true;
  const status = (e as { status?: unknown } | null)?.status;
  return status === 503 || status === 429;
}

/** Log line text. Server console only; never sent to the browser. */
function describe(e: unknown): string {
  const status = (e as { status?: unknown } | null)?.status;
  const message = e instanceof Error ? e.message : String(e);
  return `${typeof status === "number" ? `HTTP ${status}: ` : ""}${message}`.slice(0, 300);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scores the case with scoring.ts and asks Gemini to explain it.
 * Order: primary model, one retry after a short pause (503, 429 or timeout), then the backup model once.
 * If all live attempts fail: the saved reply for that case, or "unavailable" (the UI shows a friendly busy message).
 */
export async function explainCaseCore(input: ExplainInput): Promise<AiOutcome> {
  const log = input.log ?? ((m: string) => console.error(m));
  const settings = parseSettings(input.seed.settings);
  const result = scoreCase(bundleFor(input.seed, input.id), settings);

  if (result.state !== "scored") {
    log(`${input.id}: case is ${result.state}; nothing to explain`);
    return { mode: "unavailable" };
  }

  const saved = input.cache[input.id];
  const useSaved = (): AiOutcome => (saved ? { mode: "cached", explanation: saved } : { mode: "unavailable" });

  if (!input.apiKey || !input.model) {
    log(`${input.id}: GEMINI_API_KEY or GEMINI_MODEL is not set on the server`);
    return useSaved();
  }

  const budget = input.budgetMs ?? DEFAULT_BUDGET_MS;
  const retryDelay = input.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const deadline = Date.now() + budget;
  const remaining = () => deadline - Date.now();
  const payload = casePayload(input.seed, input.id, result);

  type Attempt = { ok: true; explanation: AiExplanation } | { ok: false; retryable: boolean };
  const attempt = async (model: string, ms: number): Promise<Attempt> => {
    try {
      const text = await callGemini(input.apiKey!, model, input.systemPrompt, payload, Math.min(ms, remaining()));
      return { ok: true, explanation: parseExplanation(text) };
    } catch (e) {
      log(`${input.id}: ${model} failed: ${describe(e)}`);
      return { ok: false, retryable: isRetryable(e) };
    }
  };

  // Primary: about 35% of the budget, then one retry (about 30%) if the failure was 503, 429 or a timeout.
  let r = await attempt(input.model, budget * 0.35);
  if (!r.ok && r.retryable && remaining() > retryDelay + 3_000) {
    await sleep(retryDelay);
    r = await attempt(input.model, budget * 0.3);
  }
  if (r.ok) return { mode: "live", path: "primary", explanation: r.explanation };

  // Backup: once, with whatever time is left.
  if (input.fallbackModel && remaining() > 3_000) {
    const b = await attempt(input.fallbackModel, remaining());
    if (b.ok) return { mode: "live", path: "backup", explanation: b.explanation };
  } else if (!input.fallbackModel) {
    log(`${input.id}: GEMINI_FALLBACK_MODEL is not set; no backup model tried`);
  }

  const outcome = useSaved();
  log(`${input.id}: all live attempts failed; answering with ${outcome.mode === "cached" ? "a saved response" : "the busy message"}`);
  return outcome;
}
