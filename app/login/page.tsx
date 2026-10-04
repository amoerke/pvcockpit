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
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { LoginForm } from "./login-form";

// Überschreibt den Titel aus dem Root-Layout nur für diese Seite.
export const metadata: Metadata = {
  title: "Anmelden – AmpereSolar Cockpit",
};

/**
 * Bekannte Fehlercodes, die per URL-Parameter `?error=` hereinkommen können
 * (z. B. von /auth/confirm). Nur Codes aus dieser Liste werden angezeigt –
 * so kann niemand über einen präparierten Link beliebigen Text auf unserer
 * Seite einblenden.
 */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_link:
    "Der Link ist ungültig oder abgelaufen. Links aus E-Mails funktionieren " +
    "nur einmal – fordere bei Bedarf einen neuen an.",
};

// `PageProps<"/login">` ist ein globaler Hilfstyp von Next.js. `searchParams`
// ist seit Next.js 15 ein PROMISE – die Seite wird dadurch dynamisch
// gerendert (pro Request), weil die URL-Parameter erst dann feststehen.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  // Object.hasOwn statt nur ERROR_MESSAGES[error]: Sonst würde z. B.
  // `?error=toString` eine geerbte Objekt-Methode statt eines Texts liefern.
  const errorMessage =
    typeof error === "string" && Object.hasOwn(ERROR_MESSAGES, error)
      ? ERROR_MESSAGES[error]
      : undefined;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>AmpereSolar Cockpit</CardTitle>
          <CardDescription>Melde dich mit deinem Konto an.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}
          <LoginForm />
        </CardContent>
        <CardFooter>
          <Link
            href="/auth/forgot-password"
            className="text-sm underline underline-offset-4"
          >
            Passwort vergessen?
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
