// explainCase: server function behind the "AI explanation" card. Gemini runs only here.
// GEMINI_API_KEY, GEMINI_MODEL and GEMINI_FALLBACK_MODEL are read from process.env on the server and never reach
// the browser. Failure details go to the server console; the browser gets only a path label or a busy message.
import { createServerFn } from "@tanstack/react-start";
import type { SeedDb } from "./seed";

export const explainCase = createServerFn({ method: "POST" })
  .validator((id: string) => {
    if (typeof id !== "string" || !/^[A-Za-z0-9-]{1,32}$/.test(id)) throw new Error("Invalid case id");
    return id;
  })
  .handler(async ({ data: id }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { fetchSeed } = await import("./seed");
    const { explainCaseCore, extractSystemPrompt } = await import("./ai-explain");
    const { AI_CACHE } = await import("./ai-cache");
    const promptDoc = (await import("../../mock-backend/ai/explain-prompt.md?raw")).default;

    const seed = await fetchSeed(supabase as unknown as SeedDb);
    return explainCaseCore({
      seed,
      id,
      systemPrompt: extractSystemPrompt(promptDoc),
      apiKey: process.env["GEMINI_API_KEY"],
      model: process.env["GEMINI_MODEL"],
      fallbackModel: process.env["GEMINI_FALLBACK_MODEL"],
      cache: AI_CACHE,
    });
  });
