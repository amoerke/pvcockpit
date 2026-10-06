"use client";

/**
 * Live-Bereich der Übersicht (Client Component).
 *
 * Ablauf:
 * 1. Der Server rendert die Seite mit dem neuesten Messwert (initialReading).
 *    Der Browser sieht sofort Werte – ohne Lade-Spinner.
 * 2. Im Browser abonniert diese Komponente per Supabase Realtime alle neuen
 *    Zeilen in solar_readings und ersetzt damit den angezeigten Wert.
 *
 * LiveTiles, EnergyFlow und ReadingStatus sind "neutrale" Komponenten (nur
 * Props) – sie lassen sich deshalb unverändert auch hier rendern.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { minutesSince, toLiveReading, type LiveReading } from "@/lib/readings/live";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

import { EnergyFlow } from "./energy-flow";
import { LiveTiles } from "./live-tiles";
import { ReadingStatus } from "./reading-status";

/** Wie oft die Altersanzeige ohne neue Daten aktualisiert wird. */
const CLOCK_INTERVAL_MS = 30_000;

type Connection = "connecting" | "live" | "offline";

export function LiveDashboard({
  initialReading,
  fetchedAt,
}: {
  initialReading: LiveReading;
  /** Zeitpunkt der Server-Abfrage (ms seit 1970) – Startwert für die Uhr. */
  fetchedAt: number;
}) {
  const [reading, setReading] = useState(initialReading);
  // "Jetzt" als State statt Date.now() im Render: Der Render bleibt rein, und
  // Server-HTML und erster Browser-Render stimmen überein (kein
  // Hydration-Mismatch), weil beide mit fetchedAt starten.
  const [now, setNow] = useState(fetchedAt);
  const [connection, setConnection] = useState<Connection>("connecting");

  // Uhr: lässt die Altersanzeige weiterlaufen, auch wenn keine Zeile kommt –
  // sonst würde "seit X Min. keine neuen Daten" nie erscheinen.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Realtime-Abo auf neue Messwerte.
  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | undefined;
    // Wird der Effect abgebaut, während setAuth() noch läuft, darf danach
    // kein Kanal mehr geöffnet werden (sonst bleibt ein Abo "verwaist").
    let cancelled = false;

    async function subscribe() {
      // Zuerst den Login-Token an Realtime übergeben. Ohne das meldet sich der
      // Kanal mit dem Anon-Key an (der Token wird sonst erst später geladen) –
      // Realtime prüft dann die Rechte der Rolle anon, die laut Migration 0001
      // nichts lesen darf, und schickt Zeilen ohne Inhalt plus
      // "Error 401: Unauthorized".
      await supabase.realtime.setAuth();
      if (cancelled) return;

      channel = supabase
        .channel("solar_readings:live")
        // Generic = Zeilentyp → payload.new ist typisiert statt `any`.
        .on<Tables<"solar_readings">>(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "solar_readings" },
          (payload) => {
            // Bei fehlenden Rechten ist payload.new leer und der Grund steht
            // in payload.errors – dann den alten Wert stehen lassen.
            if (payload.errors?.length) {
              console.error("[realtime]", payload.errors);
              setConnection("offline");
              return;
            }
            // payload.new ist die komplette Zeile – toLiveReading() nimmt sich
            // daraus, was es braucht (gleiche Umrechnung wie auf dem Server).
            setReading(toLiveReading(payload.new));
            setNow(Date.now());
          },
        )
        // status: SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT | CLOSED.
        // Bei Abbrüchen verbindet sich der Client selbst neu.
        .subscribe((status) => {
          setConnection(status === "SUBSCRIBED" ? "live" : "offline");
        });
    }

    subscribe();

    // Cleanup: Wird aufgerufen, wenn die Komponente verschwindet (Seite
    // verlassen) – und im Dev-Modus einmal extra, weil Strict Mode jeden
    // Effect testweise auf- und wieder abbaut.
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Aktuell</h1>
        <div className="flex items-center gap-3">
          <ConnectionBadge connection={connection} />
          <ReadingStatus
            timestamp={reading.timestamp}
            ageMinutes={minutesSince(reading.timestamp, now)}
          />
        </div>
      </div>

      <LiveTiles reading={reading} />
      <EnergyFlow reading={reading} />
    </>
  );
}

const CONNECTION_LABEL: Record<Connection, string> = {
  connecting: "verbinde …",
  live: "Live",
  offline: "getrennt",
};

/** Punkt + Text: Ist die Realtime-Verbindung aktiv? */
function ConnectionBadge({ connection }: { connection: Connection }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          connection === "live" && "bg-green-500",
          connection === "connecting" && "bg-muted-foreground animate-pulse",
          connection === "offline" && "bg-destructive",
        )}
      />
      {CONNECTION_LABEL[connection]}
    </span>
  );
}
