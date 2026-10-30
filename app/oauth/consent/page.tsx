/**
 * /oauth/consent – hier stimmt der Nutzer zu, dass ein MCP-Client (Claude
 * Code, claude.ai …) seine Daten lesen darf.
 *
 * Ablauf: Der Client schickt den Browser zu Supabase Auth (/oauth/authorize).
 * Supabase legt eine Anfrage an und leitet hierher weiter, mit
 * ?authorization_id=…. Diese Seite zeigt, WER fragt, und schickt die
 * Entscheidung zurück an Supabase (actions.ts). Supabase leitet dann mit
 * einem Code zum Client weiter.
 *
 * Ohne Login schickt der Proxy erst nach /login, mit ?next= zurück hierher.
 *
 * Doku: docs/learning/05-oauth.md, Schritt 2
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { verifySession } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

import { decide } from "./actions";

export const metadata: Metadata = {
  title: "Zugriff erlauben – AmpereSolar Cockpit",
};

export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const user = await verifySession();
  const { authorization_id: authorizationId, error } = await searchParams;

  if (typeof authorizationId !== "string" || !authorizationId) {
    return <Problem text="Die Anfrage ist unvollständig. Starte die Verbindung im Programm noch einmal." />;
  }

  const supabase = await createClient();
  const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (detailsError || !data) {
    return <Problem text="Diese Anfrage ist ungültig oder abgelaufen. Starte die Verbindung im Programm noch einmal." />;
  }

  // Schon früher zugestimmt (gleicher Client, gleiche Rechte): Supabase
  // liefert direkt die Rücksprung-Adresse mit Code, keine Frage nötig.
  if (!("authorization_id" in data)) {
    redirect(data.redirect_url);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{data.client.name || "Ein Programm"} möchte auf dein Cockpit zugreifen</CardTitle>
          <CardDescription>Angemeldet als {user.email}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-3 text-sm">
          {error && (
            <p role="alert" className="text-destructive">
              Das hat nicht geklappt. Bitte noch einmal versuchen.
            </p>
          )}
          <p>Das Programm darf danach in deinem Namen <strong>lesen</strong>:</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            <li>Erzeugung, Verbrauch, Netzbezug und Einspeisung</li>
            <li>Autarkie, Eigenverbrauch und Ersparnis</li>
            <li>aktuelle Leistungen und Ladezustand der Batterie</li>
          </ul>
          <p className="text-muted-foreground">Ändern oder löschen kann es nichts.</p>
          {/* Die Rücksprung-Adresse zeigt, wohin der Zugang geht – z. B.
              localhost bei Claude Code. Eine unerwartete Adresse ist ein
              Warnzeichen. */}
          <p className="text-muted-foreground">
            Rücksprung an: <code className="break-all">{data.redirect_uri}</code>
          </p>
        </CardContent>

        <CardFooter>
          {/* Ein Formular, zwei Knöpfe: Der gedrückte Knopf schickt sein
              name/value mit. So weiß die Action, was gewählt wurde. */}
          <form action={decide} className="flex w-full gap-2">
            <input type="hidden" name="authorization_id" value={data.authorization_id} />
            <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">
              Ablehnen
            </Button>
            <Button type="submit" name="decision" value="approve" className="flex-1">
              Erlauben
            </Button>
          </form>
        </CardFooter>
      </Card>
    </main>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Zugriff erlauben</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-sm text-destructive">
            {text}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
