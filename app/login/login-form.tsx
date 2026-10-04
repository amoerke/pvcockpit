/**
 * Das Login-Formular als CLIENT Component.
 *
 * Warum Client? `useActionState` ist ein React-Hook, und Hooks gibt es nur in
 * Client Components. Wir brauchen ihn für zwei Dinge, die nur im Browser
 * passieren: Fehlermeldungen ohne Neuladen anzeigen und den Button während
 * des Absendens sperren.
 *
 * Die Server Action `login` wird trotzdem auf dem Server ausgeführt – wir
 * importieren hier nur eine "Referenz" darauf. Next.js ersetzt den Import
 * beim Bundling durch einen POST-Aufruf an den Server.
 */
"use client";

import { LogIn } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { login } from "./actions";
import type { LoginState } from "./definitions";

const initialState: LoginState = {};

export function LoginForm() {
  // useActionState verbindet Formular und Server Action:
  // - state:      was die Action zuletzt zurückgegeben hat
  // - formAction: an <form action> übergeben; ruft `login(state, formData)` auf
  // - pending:    true, solange die Action läuft
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    // `action={formAction}` statt onSubmit: Das Formular funktioniert dadurch
    // sogar, bevor das JavaScript geladen ist (Progressive Enhancement) –
    // dann als normaler POST mit Seiten-Neuladen.
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          // Nach einem Fehler setzt React das Formular zurück; defaultValue
          // sorgt dafür, dass die E-Mail stehen bleibt.
          //
          // Ein "Default" darf sich nach dem ersten Rendern eigentlich nicht
          // mehr ändern (Base UI warnt sonst). Der `key` löst das: Ändert er
          // sich, verwirft React das Feld und legt es neu an – mit dem neuen
          // defaultValue als Startwert.
          key={state.email}
          defaultValue={state.email}
          // aria-invalid färbt das Feld rot (shadcn-Styles) und informiert
          // Screenreader; aria-describedby verknüpft die Fehlermeldung.
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
        />
        {state.fieldErrors?.email && (
          <p id="email-error" className="text-sm text-destructive">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          name="password"
          type="password"
          // Erlaubt Passwort-Managern das Ausfüllen.
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={
            state.fieldErrors?.password ? "password-error" : undefined
          }
        />
        {state.fieldErrors?.password && (
          <p id="password-error" className="text-sm text-destructive">
            {state.fieldErrors.password[0]}
          </p>
        )}
      </div>

      {/* role="alert" lässt Screenreader die Meldung sofort vorlesen. */}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        <LogIn data-icon="inline-start" />
        {pending ? "Anmelden …" : "Anmelden"}
      </Button>
    </form>
  );
}
