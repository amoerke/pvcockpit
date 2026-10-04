/**
 * /dashboard – Übersicht (Server Component).
 *
 * Kopfzeile und Navigation kommen aus ./layout.tsx.
 *
 * Schutz in zwei Schichten:
 * 1. proxy.ts leitet Nicht-Eingeloggte schon vorab nach /login (UX).
 * 2. verifySession() hier ist die VERBINDLICHE Prüfung (Sicherheit).
 *
 * Warum die Prüfung in der Seite und nicht (nur) im layout.tsx?
 * Layouts rendern bei einer Navigation zwischen ihren Unterseiten NICHT neu
 * (Partial Rendering). Eine Prüfung im Layout liefe also nicht bei jedem
 * Seitenwechsel. Seiten dagegen rendern bei jedem Aufruf.
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
  title: "Übersicht – AmpereSolar Cockpit",
};

export default async function DashboardPage() {
  // Leitet ohne gültige Session nach /login um und kehrt dann nie zurück.
  // Danach ist `user` garantiert gesetzt – und nur { id, email } (DTO).
  const user = await verifySession();

  return (
    <main className="flex flex-1 items-start justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Willkommen!</CardTitle>
          <CardDescription>
            Du bist angemeldet als {user.email}. Hier erscheinen gleich die
            Live-Werte deiner Anlage.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
