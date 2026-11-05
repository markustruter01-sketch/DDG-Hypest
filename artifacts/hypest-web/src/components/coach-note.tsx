import { useQuery } from "@tanstack/react-query";
import { getDailyNote } from "@workspace/api-client-react";
import { request } from "@/lib/coaching";

/** Today's note from the coach (step 2.4), plus a recent check-in or weekly review. Written once per local day. */
export function CoachNote({ coachName }: { coachName: string }) {
  const day = new Date().toLocaleDateString("en-CA");
  const note = useQuery({ queryKey: ["daily-note", day], queryFn: () => getDailyNote(request), staleTime: 60 * 60 * 1000, retry: false });
  const update = note.data?.updates.at(0);
  if (!note.data?.note && !update) return null;
  return (
    <div className="card coach-note">
      {update ? (
        <p><span className="label">{update.source === "weekly_review" ? `Your week, from ${coachName}` : update.source === "midweek_check" ? `Mid-week, from ${coachName}` : `${coachName} checked in`}</span><br />{update.text}</p>
      ) : null}
      {note.data?.note ? <p><span className="label">{coachName} today</span><br />{note.data.note}</p> : null}
    </div>
  );
}
