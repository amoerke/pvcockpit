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
import { getLatestReading, getTodayTotals } from "@/lib/data/readings";

import { LiveDashboard } from "./live-dashboard";
import { SelfSufficiency } from "./self-sufficiency";
import { TodayBalance } from "./today-balance";

export const metadata: Metadata = {
  title: "Übersicht – AmpereSolar Cockpit",
};

export default async function DashboardPage() {
  await verifySession();
  // Promise.all: Beide Abfragen starten gleichzeitig. Mit zwei einzelnen
  // `await` nacheinander würde die zweite erst nach der ersten beginnen
  // ("Wasserfall") – die Wartezeiten addierten sich.
  const [latest, today] = await Promise.all([
    getLatestReading(),
    getTodayTotals(),
  ]);

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

  // Server-Wert als Startwert; ab dann aktualisiert LiveDashboard im Browser
  // per Realtime. Props an Client Components müssen serialisierbar sein –
  // reading ist ein schlichtes Objekt, fetchedAt eine Zahl.
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
      <LiveDashboard initialReading={latest.reading} fetchedAt={latest.fetchedAt} />
      <TodayBalance totals={today} />
      <SelfSufficiency totals={today} />
    </main>
  );
}
