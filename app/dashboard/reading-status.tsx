/**
 * Zeigt, wie aktuell die Daten sind – und warnt, wenn der Pi länger
 * nichts geschrieben hat (normal: ein Wert pro Minute).
 */
import { CircleAlert } from "lucide-react";

import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Ab diesem Alter gelten die Daten als veraltet (Pi offline?). */
const STALE_AFTER_MINUTES = 5;

export function ReadingStatus({
  timestamp,
  ageMinutes,
}: {
  timestamp: string;
  ageMinutes: number;
}) {
  const stale = ageMinutes >= STALE_AFTER_MINUTES;

  return (
    <p
      // role="status": Live-Änderungen werden von
      // Screenreadern höflich angesagt.
      role="status"
      className={cn(
        "flex items-center gap-1.5 text-sm",
        stale ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {stale && <CircleAlert className="size-4" aria-hidden />}
      Stand: {formatTime(timestamp)} Uhr
      {stale && ` – seit ${Math.floor(ageMinutes)} Min. keine neuen Daten`}
    </p>
  );
}
