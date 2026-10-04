/**
 * Schema und Typen für "Passwort vergessen".
 */
import { z } from "zod";

export const ForgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .pipe(z.email({ error: "Bitte eine gültige E-Mail-Adresse eingeben." })),
});

export type ForgotPasswordState = {
  fieldErrors?: { email?: string[] };
  /** true, sobald die Anfrage verarbeitet wurde – egal mit welchem Ergebnis. */
  submitted?: boolean;
  email?: string;
};
