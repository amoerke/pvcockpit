/**
 * Waagerechter Balken für einen Anteil von 0–100 %.
 *
 * role="meter" + aria-Werte: Screenreader lesen "Ladezustand, 63 %" vor.
 * (Ein <progress> wäre falsch – das bedeutet "Fortschritt einer Aufgabe".)
 *
 * Neutrale Komponente: wird in den Live-Kacheln (Client) und in der
 * Unabhängigkeits-Karte (Server) verwendet.
 */
export function Meter({ label, percent }: { label: string; percent: number | null }) {
  if (percent === null) return null;
  const clamped = Math.min(Math.max(percent, 0), 100);

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className="h-2 overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
    </div>
  );
}
