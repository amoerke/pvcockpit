/**
 * /auth/forgot-password – öffentliche Seite (Proxy gibt /auth/* frei).
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

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Passwort vergessen – AmpereSolar Cockpit",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Passwort vergessen</CardTitle>
          <CardDescription>
            Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen
            kannst.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
        <CardFooter>
          {/* <Link> statt <a>: Client-seitige Navigation ohne Neuladen,
              inklusive Prefetching der Zielseite. */}
          <Link href="/login" className="text-sm underline underline-offset-4">
            Zurück zur Anmeldung
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
