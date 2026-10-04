/**
 * Formular "Passwort vergessen" – Client Component.
 * Nach dem Absenden wird statt des Formulars eine neutrale Bestätigung gezeigt.
 */
"use client";

import { Mail } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { requestPasswordReset } from "./actions";
import type { ForgotPasswordState } from "./definitions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  if (state.submitted) {
    // role="status": Screenreader lesen die Meldung vor, aber weniger
    // aufdringlich als bei role="alert" (es ist ja kein Fehler).
    return (
      <p role="status" className="text-sm">
        Falls für <strong>{state.email}</strong> ein Konto existiert, haben wir
        eine E-Mail mit einem Link zum Zurücksetzen geschickt. Der Link ist
        nur einmal gültig.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          key={state.email}
          defaultValue={state.email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
        />
        {state.fieldErrors?.email && (
          <p id="email-error" className="text-sm text-destructive">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        <Mail data-icon="inline-start" />
        {pending ? "Senden …" : "Link anfordern"}
      </Button>
    </form>
  );
}
