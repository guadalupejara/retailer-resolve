import { skipToken, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ScoreSummary } from "@/lib/evidence-fields";
import { BAND_CHIP } from "@/lib/queue";
import type { Band, CaseResult } from "@/lib/scoring";

/** Counts from one number to another. A new `run` restarts the count. */
function CountUp({ from, to, run }: { from: number; to: number; run: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
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
  return <>{v}</>;
}

/**
 * Big score for the case. After a document is saved, the cache holds the before/after summaries, so the
 * score counts from the old value to the new one and the band change is shown.
 */
export function ScoreReadout({ id, r, cap }: { id: string; r: CaseResult; cap: number }) {
  const rescore = useQuery<{ before: ScoreSummary; after: ScoreSummary; run: number } | undefined>({
    queryKey: ["rescore", id],
    queryFn: skipToken,
  });
  const re = rescore.data;
  const from = re?.before.display;
  const to = re?.after.display;
  const bandBefore = re?.before.band;
  const bandAfter = re?.after.band;
  return (
    <div>
      <div className="flex items-end gap-4">
        <div className="num text-6xl">
          {re && from != null && to != null ? <CountUp from={from} to={to} run={re.run} /> : (r.display ?? "—")}
        </div>
        {r.band && <span className={`${BAND_CHIP[r.band as Band]} mb-2`}>{r.band}</span>}
      </div>
      {re && bandBefore && bandAfter && (
        <div className="mt-3 text-sm">
          <span className="font-medium">Rescored:</span>{" "}
          <span className={BAND_CHIP[bandBefore as Band]}>{bandBefore}</span> → <span className={BAND_CHIP[bandAfter as Band]}>{bandAfter}</span>
        </div>
      )}
      {r.capped && r.raw != null && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <div className="font-medium">Capped at {cap}: would be {r.raw}</div>
          <div className="mt-1 text-xs">Fatal: {r.capped_by.join("; ")}</div>
        </div>
      )}
    </div>
  );
}
