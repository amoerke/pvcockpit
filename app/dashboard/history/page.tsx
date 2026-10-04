/**
 * /dashboard/history – Verlauf (vorerst Platzhalter, Inhalt folgt in Schritt 17).
 *
 * Auch Unterseiten prüfen selbst: verifySession() gehört in JEDE geschützte
 * Seite, nicht nur ins Layout (Begründung in ../layout.tsx).
 */
import type { Metadata } from "next";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { verifySession } from "@/lib/dal";

export const metadata: Metadata = {
  title: "Verlauf – AmpereSolar Cockpit",
};

export default async function HistoryPage() {
  await verifySession();

  return (
    <main className="flex flex-1 items-start justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Verlauf</CardTitle>
          <CardDescription>
            Hier erscheinen bald Leistungskurven und Tagesenergien mit
            Zeitraumauswahl.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
