/**
 * Formular "Passwort setzen" – Client Component, gleiches Muster wie das
 * Login-Formular (useActionState + Server Action).
 */
"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { setPassword } from "./actions";
import { PASSWORD_MIN_LENGTH, type SetPasswordState } from "./definitions";

const initialState: SetPasswordState = {};

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState(setPassword, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Neues Passwort</Label>
        <Input
          id="password"
          name="password"
          type="password"
          // "new-password" signalisiert Passwort-Managern: Hier ein neues,
          // starkes Passwort vorschlagen (statt ein gespeichertes einzusetzen).
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-sm text-muted-foreground">
          {state.fieldErrors?.password ? (
            <span className="text-destructive">
              {state.fieldErrors.password[0]}
            </span>
          ) : (
            `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen – gern eine Passphrase.`
          )}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Passwort wiederholen</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          aria-describedby={
            state.fieldErrors?.confirmPassword ? "confirm-error" : undefined
          }
        />
        {state.fieldErrors?.confirmPassword && (
          <p id="confirm-error" className="text-sm text-destructive">
            {state.fieldErrors.confirmPassword[0]}
          </p>
        )}
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        <KeyRound data-icon="inline-start" />
        {pending ? "Speichern …" : "Passwort speichern"}
      </Button>
    </form>
  );
}
