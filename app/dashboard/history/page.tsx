/**
 * /dashboard/history – Verlauf eines Tages: Leistungskurve, Tagesbilanz,
 * Autarkie und Eigenverbrauch.
 *
 * Der Tag steht in der URL: /dashboard/history?date=2026-10-14
 * (ohne ?date= → heute). `searchParams` ist in dieser Next-Version ein
 * Promise und muss mit `await` gelesen werden. Wer es liest, macht die Seite
 * dynamisch – sie wird bei jedem Aufruf neu gerendert. Das ist hier gewollt.
 *
 * Auch Unterseiten prüfen selbst: verifySession() gehört in JEDE geschützte
 * Seite, nicht nur ins Layout (Begründung in ../layout.tsx).
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
import { getDayHistory } from "@/lib/data/readings";

import { SelfSufficiency } from "../self-sufficiency";
import { TodayBalance } from "../today-balance";
import { DayChart } from "./day-chart";
import { DayNav } from "./day-nav";

export const metadata: Metadata = {
  title: "Verlauf – AmpereSolar Cockpit",
};

export default async function HistoryPage(props: PageProps<"/dashboard/history">) {
  await verifySession();

  // Der Wert aus der URL ist eine Benutzereingabe – getDayHistory() prüft ihn.
  const { date } = await props.searchParams;
  const history = await getDayHistory(date);
  const hasData = history.totals !== null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
      <DayNav day={history.day} today={history.today} />

      <Card>
        <CardHeader>
          <CardTitle>Leistung</CardTitle>
          <CardDescription>
            Mittelwerte je 5 Minuten. Batterie: über 0 entladen, unter 0 laden.
            Netz: über 0 Bezug, unter 0 Einspeisung.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <DayChart curve={history.curve} startMs={history.startMs} endMs={history.endMs} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Für diesen Tag liegen keine Messwerte vor.
            </p>
          )}
        </CardContent>
      </Card>

      <TodayBalance totals={history.totals} title="Tagesbilanz" />
      <SelfSufficiency totals={history.totals} title="Unabhängigkeit" />
    </main>
  );
}
