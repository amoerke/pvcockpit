/**
 * Schema und Typen für "Passwort setzen" (nach Einladung oder Reset).
 */
import { z } from "zod";

/**
 * Passwortregeln (abgestimmt auf NIST SP 800-63B / BSI):
 * - Länge statt Komplexität: mindestens 12 Zeichen, KEINE Pflicht zu
 *   Sonderzeichen oder Ziffern. Lange Passphrasen sind sicherer und leichter
 *   zu merken; Passwort-Manager erzeugen ohnehin lange Zufallswerte.
 * - Höchstens 72 Zeichen: Supabase speichert Passwörter mit bcrypt, und
 *   bcrypt berücksichtigt nur die ersten 72 Bytes. Alles danach würde still
 *   ignoriert – besser, wir sagen es offen.
 *
 * Dieselbe Mindestlänge ist serverseitig per GOTRUE_PASSWORD_MIN_LENGTH
 * gesetzt. Die Prüfung hier ist für schnelles, verständliches Feedback; die
 * auf dem Auth-Server gilt auch dann, wenn jemand unsere App umgeht.
 */
export const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 72;

export const SetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, {
        error: `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`,
      })
      .max(PASSWORD_MAX_LENGTH, {
        error: `Höchstens ${PASSWORD_MAX_LENGTH} Zeichen.`,
      }),
    confirmPassword: z.string(),
  })
  // refine() prüft Bedingungen über MEHRERE Felder. `path` legt fest, an
  // welchem Feld der Fehler angezeigt wird.
  .refine((data) => data.password === data.confirmPassword, {
    error: "Die Passwörter stimmen nicht überein.",
    path: ["confirmPassword"],
  });

export type SetPasswordState = {
  fieldErrors?: {
    password?: string[];
    confirmPassword?: string[];
  };
  error?: string;
};
