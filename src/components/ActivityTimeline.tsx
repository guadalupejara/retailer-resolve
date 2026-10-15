import { useCurrentUser } from "@/lib/current-user";
import { ACTION_LABEL } from "@/lib/decision-rules";
import { useActivity } from "@/lib/activity";

/** Newest first. Who, what, when (Pacific time), the note, and the displayed score at the time. */
export function ActivityTimeline({ caseId }: { caseId: string }) {
  const q = useActivity(caseId);
  const { users } = useCurrentUser();
  const nameOf = (actor: string) => users.find((u) => u.id === actor)?.name ?? (actor === "system" ? "System" : actor);

  return (
    <section className="mt-10">
      <h2 className="text-2xl">Activity</h2>
      {q.isPending && <div className="panel mt-4 p-6 text-sm text-muted-foreground">Loading activity…</div>}
      {q.isError && <div className="panel mt-4 p-6 text-sm text-destructive">Couldn't load activity. Try again in a moment.</div>}
      {q.data && q.data.length === 0 && <div className="panel mt-4 p-6 text-sm text-muted-foreground">No activity yet.</div>}
      {q.data && q.data.length > 0 && (
        <ol className="panel mt-4 divide-y divide-border">
          {q.data.map((row) => (
            <li key={row.id} className="grid gap-1 px-5 py-3 text-sm md:grid-cols-[1fr_auto]">
              <div>
                <span className="font-medium">{nameOf(row.actor)}</span>{" "}
                <span>{ACTION_LABEL[row.action] ?? row.action}</span>
                {row.note && <div className="mt-0.5 text-xs text-muted-foreground">{row.note}</div>}
              </div>
              <div className="num flex gap-4 text-xs text-muted-foreground md:justify-end">
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
