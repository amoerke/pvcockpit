/**
 * Gemeinsame Teile der Verlaufs-Diagramme (Tageskurve und Balken).
 *
 * Kein "use client": Farben und TooltipRow brauchen keine Hooks. Sie werden
 * von den Client-Diagrammen importiert und laufen dann mit im Browser.
 */

/**
 * Farben je Energiefluss, getrennt für Hell und Dunkel. Die Theme-Farben
 * (--chart-1 …) sind in unserem Design nur Grautöne – für unterscheidbare
 * Linien und Balken braucht es echte Farben.
 */
export const SERIES_COLORS = {
  pv: { light: "oklch(0.75 0.16 70)", dark: "oklch(0.82 0.15 80)" },
  house: { light: "oklch(0.5 0.15 255)", dark: "oklch(0.72 0.13 255)" },
  battery: { light: "oklch(0.58 0.15 150)", dark: "oklch(0.74 0.15 150)" },
  grid: { light: "oklch(0.58 0.2 25)", dark: "oklch(0.7 0.17 25)" },
};

/** Eine Zeile im Tooltip: Farbe, Bezeichnung, Wert rechtsbündig. */
export function TooltipRow({
  color,
  label,
  value,
}: {
  color?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium tabular-nums">{value}</span>
    </div>
  );
}
