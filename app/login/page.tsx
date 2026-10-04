/**
 * /login – eine SERVER Component (Standard im App Router, kein "use client").
 *
 * Sie rendert nur das statische Gerüst (Karte, Überschrift) auf dem Server.
 * Das interaktive Formular ist eine eigene Client Component. Faustregel:
 * "use client" so tief wie möglich im Baum setzen – dann landet nur das
 * nötige JavaScript im Browser.
 *
 * Kein verifySession() hier: Die Seite muss ohne Login erreichbar sein.
 * Eingeloggte Nutzer leitet bereits der Proxy nach /dashboard weiter.
 */
import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { LoginForm } from "./login-form";

// Überschreibt den Titel aus dem Root-Layout nur für diese Seite.
export const metadata: Metadata = {
  title: "Anmelden – AmpereSolar Cockpit",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>AmpereSolar Cockpit</CardTitle>
          <CardDescription>Melde dich mit deinem Konto an.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
