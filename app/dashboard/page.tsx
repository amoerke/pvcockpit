/**
 * /dashboard – die erste geschützte Seite (Server Component).
 *
 * Schutz in zwei Schichten:
 * 1. proxy.ts leitet Nicht-Eingeloggte schon vorab nach /login (UX).
 * 2. verifySession() hier ist die VERBINDLICHE Prüfung (Sicherheit).
 *
 * Warum die Prüfung in der Seite und nicht in einem layout.tsx?
 * Layouts rendern bei einer Navigation zwischen ihren Unterseiten NICHT neu
 * (Partial Rendering). Eine Prüfung im Layout liefe also nicht bei jedem
 * Seitenwechsel. Seiten dagegen rendern bei jedem Aufruf.
 */
import { LogOut } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { logout } from "@/lib/actions/auth";
import { verifySession } from "@/lib/dal";

export const metadata: Metadata = {
  title: "Dashboard – AmpereSolar Cockpit",
};

export default async function DashboardPage() {
  // Leitet ohne gültige Session nach /login um und kehrt dann nie zurück.
  // Danach ist `user` garantiert gesetzt – und nur { id, email } (DTO).
  const user = await verifySession();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-medium">AmpereSolar Cockpit</span>

        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <form action={logout}>
            <Button variant="outline" type="submit">
              <LogOut data-icon="inline-start" />
              Abmelden
            </Button>
          </form>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center p-6">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Willkommen!</CardTitle>
            <CardDescription>
              Du bist angemeldet als {user.email}. Hier erscheinen in
              Meilenstein 2 die Statistiken zu deinen AmpereStorage-Werten.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    </div>
  );
}
