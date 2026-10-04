/**
 * Schema und Typen für das Login-Formular.
 *
 * Warum eine eigene Datei und nicht direkt in actions.ts?
 * Eine Datei mit "use server" darf nur async-Funktionen exportieren – kein
 * Schema, keine Konstanten. Typen und Schema liegen deshalb hier und werden
 * von der Server Action und vom Formular gemeinsam genutzt.
 */
import { z } from "zod";

/**
 * Zod beschreibt, wie gültige Eingaben aussehen. `safeParse` prüft dann
 * unbekannte Daten (aus dem Formular kommt *alles* als String oder null)
 * und liefert entweder typsichere Daten oder strukturierte Fehler.
 */
export const LoginSchema = z.object({
  // trim() entfernt versehentliche Leerzeichen (z. B. beim Einfügen),
  // danach muss es eine gültige E-Mail-Adresse sein.
  email: z
    .string()
    .trim()
    .pipe(z.email({ error: "Bitte eine gültige E-Mail-Adresse eingeben." })),
  // Beim Login prüfen wir nur "nicht leer". Regeln zur Passwortstärke gehören
  // dorthin, wo ein Passwort GESETZT wird (Schritt 7).
  password: z.string().min(1, { error: "Bitte das Passwort eingeben." }),
});

/**
 * Der Zustand, den die Server Action an das Formular zurückgibt.
 * `useActionState` reicht ihn beim nächsten Aufruf wieder an die Action
 * hinein (`prevState`) und rendert das Formular damit neu.
 */
export type LoginState = {
  /** Fehler pro Feld (aus der Zod-Validierung). */
  fieldErrors?: {
    email?: string[];
    password?: string[];
  };
  /** Allgemeiner Fehler, z. B. "E-Mail oder Passwort falsch". */
  error?: string;
  /** Eingegebene E-Mail – damit das Feld nach einem Fehler nicht leer ist. */
  email?: string;
};
