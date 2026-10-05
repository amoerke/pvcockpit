/**
 * /dashboard – Übersicht (Server Component).
 *
 * Kopfzeile und Navigation kommen aus ./layout.tsx.
 *
 * Daten holen in einer Server Component: Die Komponente ist einfach `async`
 * und wartet auf die Daten – kein useEffect, kein Lade-Spinner im Browser,
 * keine eigene API-Route. Der Browser bekommt fertiges HTML mit Werten.
 *
 * Schutz: getLatestReading() ruft selbst verifySession() auf (DAL). Der
 * zusätzliche Aufruf hier macht die Absicht der Seite explizit und kostet
 * dank React cache() nichts.
 */
import type { Metadata } from "next";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { verifySession } from "@/lib/dal";
import { getLatestReading } from "@/lib/data/readings";

import { EnergyFlow } from "./energy-flow";
import { LiveTiles } from "./live-tiles";
import { ReadingStatus } from "./reading-status";

export const metadata: Metadata = {
  title: "Übersicht – AmpereSolar Cockpit",
};

export default async function DashboardPage() {
  await verifySession();
  const latest = await getLatestReading();

  // Leerer Zustand: Die Tabelle hat (noch) keine Zeilen.
  if (!latest) {
    return (
      <main className="flex flex-1 items-start justify-center p-6">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Noch keine Messwerte</CardTitle>
            <CardDescription>
              Sobald der Raspberry Pi die ersten Werte schreibt, erscheinen sie hier.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // ageMinutes bezieht sich auf den Zeitpunkt, an dem der SERVER die Daten
  // geholt hat. Die Anzeige bleibt danach stehen – sie zählt im Browser
  // nicht weiter. Das ändert sich mit den Live-Updates in Schritt 14.
  const { reading, ageMinutes } = latest;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Aktuell</h1>
        <ReadingStatus timestamp={reading.timestamp} ageMinutes={ageMinutes} />
      </div>

      <LiveTiles reading={reading} />
      <EnergyFlow reading={reading} />
    </main>
  );
}
