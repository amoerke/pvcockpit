/**
 * /dashboard/chat – Fragen zur Anlage in natürlicher Sprache.
 *
 * Die Seite selbst ist eine Server Component und prüft nur den Login. Der
 * Chat ist eine Client-Insel: Verlauf, Eingabe und Laden leben im Browser,
 * die Antworten kommen von POST /api/chat.
 */
import type { Metadata } from "next";

import { verifySession } from "@/lib/dal";

import { Chat } from "./chat";

export const metadata: Metadata = {
  title: "Assistent – AmpereSolar Cockpit",
};

export default async function ChatPage() {
  await verifySession();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Assistent</h1>
        <p className="text-sm text-muted-foreground">
          Fragen zu Erzeugung, Verbrauch, Autarkie und Ersparnis. Die Zahlen
          kommen aus deinen Messwerten.
        </p>
      </div>

      <Chat />
    </main>
  );
}
