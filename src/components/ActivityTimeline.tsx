import { useState } from "react";
import { useCurrentUser } from "@/lib/current-user";
import { ACTION_LABEL } from "@/lib/decision-rules";
import { useActivity } from "@/lib/activity";

/** Newest first. Who, what, when (Pacific time), the note, and the displayed score at the time. */
export function ActivityTimeline({ caseId, limit }: { caseId: string; limit?: number }) {
  const q = useActivity(caseId);
  const { users } = useCurrentUser();
  const [all, setAll] = useState(false);
  const nameOf = (actor: string) => users.find((u) => u.id === actor)?.name ?? (actor === "system" ? "System" : actor);
  const rows = q.data ?? [];
  const shown = limit && !all ? rows.slice(0, limit) : rows;

  return (
    <section className="panel p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="section-title">Activity</h2>
        {limit && rows.length > limit && (
          <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setAll((v) => !v)}>
            {all ? "Show less" : `Show all (${rows.length})`}
          </button>
        )}
      </div>
      {q.isPending && <div className="mt-3 text-sm text-muted-foreground">Loading activity…</div>}
      {q.isError && <div className="mt-3 text-sm text-destructive">Couldn't load activity. Try again in a moment.</div>}
      {q.data && rows.length === 0 && <div className="mt-3 text-sm text-muted-foreground">No activity yet.</div>}
      {shown.length > 0 && (
        <ol className="mt-3 space-y-0">
          {shown.map((row, i) => (
            <li key={row.id} className="relative pb-4 pl-5 text-sm last:pb-0">
              {/* Timeline rail and dot */}
              {i < shown.length - 1 && <span className="absolute top-2.5 bottom-0 left-[3px] w-px bg-border" aria-hidden />}
              <span className={`absolute top-1.5 left-0 size-[7px] rounded-full ${i === 0 ? "bg-primary" : "bg-muted-foreground/40"}`} aria-hidden />
              <div>
                <span className="font-medium">{nameOf(row.actor)}</span>{" "}
                <span className="text-muted-foreground">{(ACTION_LABEL[row.action] ?? row.action).toLowerCase()}</span>
              </div>
              {row.note && <div className="mt-0.5 text-xs text-muted-foreground">{row.note}</div>}
              <div className="num mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>{new Date(row.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })} PT</span>
                <span>Score {row.score_at_action ?? "—"}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
