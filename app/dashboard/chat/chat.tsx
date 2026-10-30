/**
 * Chat – CLIENT Component.
 *
 * Der Verlauf lebt nur im React-State: Neu laden = neuer Chat. Bei jeder
 * Frage geht der ganze Verlauf (nur Text) an /api/chat; die Route kürzt ihn
 * auf die letzten Nachrichten. Das Session-Cookie schickt fetch() von selbst
 * mit, weil die Anfrage an dieselbe Origin geht.
 */
"use client";

import { SendHorizontal, Wrench } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
// Nur Typen: `import type` verschwindet beim Kompilieren, server-only
// kommt also nicht in den Browser-Code.
import type { ChatMessage, ChatResult, ToolCall } from "@/lib/assistant/chat";

const EXAMPLES = [
  "Was war gestern mein Autarkiegrad?",
  "Wie viel hat die PV-Anlage diese Woche erzeugt?",
  "Wie viel habe ich insgesamt gespart?",
  "Wie voll ist die Batterie gerade?",
];

/** Eine Nachricht in der Anzeige: Antworten merken sich ihre Tool-Aufrufe. */
type Entry = ChatMessage & { toolCalls?: ToolCall[] };

export function Chat() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Nach jeder neuen Nachricht ans Ende scrollen. Ein Effekt, weil das neue
  // Element erst nach dem Rendern im DOM steht.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [entries, pending]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;

    const history: Entry[] = [...entries, { role: "user", content: text }];
    // Frage sofort zeigen, nicht erst mit der Antwort.
    setEntries(history);
    setInput("");
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Nur role und content: toolCalls braucht der Server nicht.
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unbekannter Fehler.");

      const { answer, toolCalls } = data as ChatResult;
      setEntries([...history, { role: "assistant", content: answer, toolCalls }]);
    } catch (e) {
      // Frage zurücknehmen und wieder ins Feld stellen – so kann man es
      // einfach noch einmal schicken.
      setEntries(entries);
      setInput(text);
      setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  return (
    <Card className="flex-1">
      {/* flex-1 statt h-full: Die Karte ist selbst eine Flex-Spalte. So
          füllt der Inhalt sie aus, und die Eingabe sitzt unten. */}
      <CardContent className="flex flex-1 flex-col gap-4">
        {/* aria-live: Screenreader lesen neue Antworten von selbst vor. */}
        <div aria-live="polite" className="flex flex-1 flex-col gap-3">
          {entries.length === 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Zum Beispiel:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <Button key={example} variant="outline" size="sm" onClick={() => void ask(example)}>
                    {example}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {entries.map((entry, index) =>
            entry.role === "user" ? (
              <p key={index} className="max-w-[85%] self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                {entry.content}
              </p>
            ) : (
              <div key={index} className="flex max-w-[85%] flex-col gap-1 self-start">
                {/* pre-wrap: Absätze aus der Antwort bleiben erhalten. */}
                <p className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{entry.content}</p>
                {entry.toolCalls && entry.toolCalls.length > 0 && <ToolCalls calls={entry.toolCalls} />}
              </div>
            ),
          )}

          {pending && <p className="self-start text-sm text-muted-foreground">Schaue in die Messwerte …</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Frage stellen …"
            aria-label="Frage"
            maxLength={2000}
            disabled={pending}
          />
          <Button type="submit" disabled={pending || !input.trim()}>
            <SendHorizontal data-icon="inline-start" />
            Fragen
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Welche Tools die Antwort benutzt hat – zum Nachvollziehen, woher die
 * Zahlen kommen. <details> klappt ohne JavaScript auf und zu.
 */
function ToolCalls({ calls }: { calls: ToolCall[] }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">
        {calls.length === 1 ? "1 Abfrage" : `${calls.length} Abfragen`}
      </summary>
      <ul className="mt-1 flex flex-col gap-1">
        {calls.map((call, index) => (
          <li key={index} className="flex items-center gap-1.5 font-mono">
            <Wrench className="size-3 shrink-0" aria-hidden />
            {call.name}({formatInput(call.input)}){call.isError && " – Fehler"}
          </li>
        ))}
      </ul>
    </details>
  );
}

function formatInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  return Object.entries(input)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");
}
