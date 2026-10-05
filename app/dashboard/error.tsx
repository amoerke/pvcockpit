/**
 * Fehlerseite für alles unter /dashboard.
 *
 * error.tsx ist eine Datei-Konvention: Wirft eine Seite (oder eine
 * Komponente darin) beim Rendern einen Fehler – z. B. weil die Datenbank
 * nicht erreichbar ist –, zeigt Next.js statt einer weißen Seite diese
 * Komponente. Kopfzeile und Navigation aus layout.tsx bleiben stehen.
 *
 * Muss eine Client Component sein: Sie fängt Fehler mit einer React
 * "Error Boundary" ab. `retry()` lädt die Daten der Seite neu und rendert
 * sie erneut – klappt es diesmal, verschwindet die Fehlerseite.
 *
 * Sicherheit: In Produktion bekommt der Browser NICHT die echte
 * Fehlermeldung vom Server, sondern nur einen `digest` (Kennung, die im
 * Server-Log wiederzufinden ist). So landen keine internen Details im Browser.
 */
"use client";

import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="flex flex-1 items-start justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Daten konnten nicht geladen werden</CardTitle>
          <CardDescription>
            Bitte versuche es gleich noch einmal.
            {error.digest && ` (Fehlerkennung: ${error.digest})`}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={() => retry()}>
            <RotateCw data-icon="inline-start" />
            Erneut versuchen
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
