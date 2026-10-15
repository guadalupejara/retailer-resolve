import { skipToken, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ScoreSummary } from "@/lib/evidence-fields";
import { BAND_CHIP } from "@/lib/queue";
import type { Band, CaseResult } from "@/lib/scoring";

/** Counts from one number to another. A new `run` restarts the count. Animation only; both ends come from the engine. */
function useCountUp(from: number | undefined, to: number | undefined, run: number | undefined) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (from == null || to == null) return;
    if (from === to) { setV(to); return; }
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setV(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, run]);
  return v;
}

/**
 * Big score for the case, with the Weak / Needs work / Ready scale. After a document is saved, the cache
 * holds the before/after summaries, so the score (and the scale marker) counts from the old value to the
 * new one and the band change is shown. Band cut-offs come from settings.
 */
export function ScoreReadout({ id, r, cap, needsWorkMin, readyMin }: {
  id: string; r: CaseResult; cap: number; needsWorkMin: number; readyMin: number;
}) {
  const rescore = useQuery<{ before: ScoreSummary; after: ScoreSummary; run: number } | undefined>({
    queryKey: ["rescore", id],
    queryFn: skipToken,
  });
  const re = rescore.data;
  const from = re?.before.display ?? undefined;
  const to = re?.after.display ?? undefined;
  const counted = useCountUp(from, to, re?.run);
  const shown = re && from != null && to != null ? counted : r.display;
  const bandBefore = re?.before.band;
  const bandAfter = re?.after.band;
  const marker = Math.max(0, Math.min(100, shown ?? 0));

  return (
    <div>
      <div className="flex items-end gap-3">
        <div className="num text-6xl font-semibold leading-none tracking-[-0.03em]">
          {shown ?? "—"}<span className="ml-1 text-2xl font-medium text-muted-foreground">/100</span>
        </div>
        {r.band && <span className={`${BAND_CHIP[r.band as Band]} mb-1`}>{r.band}</span>}
      </div>

      {/* Scale: segment widths are the band cut-offs from settings. */}
      <div className="relative mt-6" aria-hidden>
        <div className="flex h-2 overflow-hidden rounded-full">
          <div className="bg-destructive/35" style={{ width: `${needsWorkMin}%` }} />
          <div className="bg-warning/50" style={{ width: `${readyMin - needsWorkMin}%` }} />
          <div className="bg-success/45" style={{ width: `${100 - readyMin}%` }} />
        </div>
        {shown != null && (
          <div className="absolute -top-1 size-4 -translate-x-1/2 rounded-full border-2 border-card bg-foreground shadow" style={{ left: `${marker}%` }} />
        )}
        <div className="relative mt-2 h-4 text-xs text-muted-foreground">
          <span className="absolute left-0">Weak</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${(needsWorkMin + readyMin) / 2}%` }}>Needs work</span>
          <span className="absolute right-0">Ready</span>
        </div>
      </div>

      {re && bandBefore && bandAfter && (
        <div className="mt-4 text-sm">
          <span className="font-medium">Rescored:</span>{" "}
          <span className={BAND_CHIP[bandBefore as Band]}>{bandBefore}</span> → <span className={BAND_CHIP[bandAfter as Band]}>{bandAfter}</span>
        </div>
      )}
      {r.capped && r.raw != null && (
        <div className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <div className="font-medium">Capped at {cap}, would be {r.raw}</div>
          <div className="mt-0.5 text-xs">Fatal: {r.capped_by.join("; ")}</div>
        </div>
      )}
    </div>
  );
}
