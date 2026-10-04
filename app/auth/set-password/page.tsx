/**
 * /auth/set-password – Passwort setzen nach Einladung oder Reset.
 *
 * Der Proxy lässt /auth/* ohne Login durch (sonst käme man vom Mail-Link
 * nicht hierher). Die Seite braucht aber trotzdem eine Session – die hat
 * /auth/confirm gerade erzeugt. verifySession() stellt das sicher; wer die
 * URL ohne gültigen Link direkt aufruft, landet auf /login.
 */
import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { verifySession } from "@/lib/dal";

import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = {
  title: "Passwort festlegen – AmpereSolar Cockpit",
};

export default async function SetPasswordPage() {
  const user = await verifySession();

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Passwort festlegen</CardTitle>
          <CardDescription>
            Wähle ein Passwort für {user.email}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetPasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
