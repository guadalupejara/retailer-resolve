import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The SDK is mocked with a scripted queue, so each test sets exactly what every Gemini call does.
// A step is a reply string, an Error (thrown like an API error), or "hang" (waits until aborted, like a timeout).
type Step = string | Error | "hang";
const script: { steps: Step[]; models: string[] } = { steps: [], models: [] };

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (args: { model: string; config: { abortSignal: AbortSignal } }) => {
        script.models.push(args.model);
        const step = script.steps.shift() ?? new Error("script exhausted");
        if (step === "hang") {
          await new Promise((_, reject) => args.config.abortSignal.addEventListener("abort", () => reject(new Error("aborted"))));
        }
        if (step instanceof Error) throw step;
        return { text: step === "hang" ? "" : step };
      },
    };
  },
}));

import { explainCaseCore, type AiExplanation, type ExplainInput } from "@/lib/ai-explain";
import type { SeedLike } from "@/lib/scoring";

const seed = JSON.parse(readFileSync(resolve(process.cwd(), "mock-backend/data/seed.json"), "utf8")) as SeedLike;
const SAVED: AiExplanation = { headline: "Saved headline", summary: "Saved summary", fixes: [] };
const GOOD = JSON.stringify({ headline: "Live headline", summary: "Live summary", fixes: [] });
const apiError = (status: number, message = "upstream error") => Object.assign(new Error(message), { status });

function input(overrides: Partial<ExplainInput> = {}): ExplainInput {
  return {
    seed, id: "WMT-001", systemPrompt: "system", apiKey: "k", model: "primary-model", fallbackModel: "backup-model",
    cache: { "WMT-001": SAVED }, retryDelayMs: 10, budgetMs: 20_000, log: () => {}, ...overrides,
  };
}

beforeEach(() => {
  script.steps = [];
  script.models = [];
});

describe("explainCaseCore", () => {
  it("answers from the primary model on success", async () => {
    script.steps = [GOOD];
    const out = await explainCaseCore(input());
    expect(out).toEqual({ mode: "live", path: "primary", explanation: { headline: "Live headline", summary: "Live summary", fixes: [] } });
    expect(script.models).toEqual(["primary-model"]);
  });

  it("retries the primary model once after a 503, then answers from it", async () => {
    script.steps = [apiError(503), GOOD];
    const out = await explainCaseCore(input());
    expect(out.mode === "live" && out.path).toBe("primary");
    expect(script.models).toEqual(["primary-model", "primary-model"]);
  });

  it("retries after a 429 as well", async () => {
    script.steps = [apiError(429), GOOD];
    const out = await explainCaseCore(input());
    expect(out.mode === "live" && out.path).toBe("primary");
  });

  it("times out a hanging primary attempt, retries, and then answers from the primary model", async () => {
    script.steps = ["hang", GOOD];
    const out = await explainCaseCore(input({ budgetMs: 20_000 }));
    expect(out.mode === "live" && out.path).toBe("primary");
    expect(script.models).toEqual(["primary-model", "primary-model"]);
  }, 20_000);

  it("uses the backup model after the primary model fails for a non-retryable reason", async () => {
    script.steps = [apiError(400, "bad request"), GOOD];
    const out = await explainCaseCore(input());
    expect(out.mode === "live" && out.path).toBe("backup");
    expect(script.models).toEqual(["primary-model", "backup-model"]);
  });

  it("uses the backup model after the primary model returns invalid JSON", async () => {
    script.steps = ["not json", GOOD];
    const out = await explainCaseCore(input());
    expect(out.mode === "live" && out.path).toBe("backup");
  });

  it("answers with the saved response when every live attempt fails", async () => {
    script.steps = [apiError(503), apiError(503), apiError(503)];
    const out = await explainCaseCore(input());
    expect(out).toEqual({ mode: "cached", explanation: SAVED });
    // primary, one retry, then one backup attempt
    expect(script.models).toEqual(["primary-model", "primary-model", "backup-model"]);
  });

  it("returns unavailable when every live attempt fails and there is no saved response", async () => {
    script.steps = [apiError(429), apiError(429), apiError(429)];
    const out = await explainCaseCore(input({ id: "WMT-002" }));
    expect(out).toEqual({ mode: "unavailable" });
  });

  it("never puts raw error text in the outcome; it goes to the log", async () => {
    script.steps = [apiError(400, "secret-detail-xyz"), apiError(400, "secret-detail-xyz")];
    const logs: string[] = [];
    const out = await explainCaseCore(input({ log: (m) => logs.push(m) }));
    expect(JSON.stringify(out)).not.toContain("secret-detail-xyz");
    expect(logs.join(" ")).toContain("secret-detail-xyz");
  });

  it("skips the network entirely when the key is missing and uses the saved response", async () => {
    const out = await explainCaseCore(input({ apiKey: undefined }));
    expect(out).toEqual({ mode: "cached", explanation: SAVED });
    expect(script.models).toEqual([]);
  });
});
