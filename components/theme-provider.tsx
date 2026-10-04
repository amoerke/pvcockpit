/**
 * Dünne Client-Hülle um den ThemeProvider von next-themes.
 *
 * Warum eine eigene Datei? Der Provider nutzt React Context und Hooks –
 * das geht nur in einer Client Component. Das Root-Layout soll aber eine
 * Server Component bleiben. Also kapseln wir den Provider hier mit
 * "use client" und importieren ihn im Layout.
 *
 * Wichtig: Eine Client Component darf Server Components als `children`
 * bekommen. Die Seiten darunter bleiben dadurch Server Components – nur der
 * Provider selbst läuft im Browser.
 */
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />;
}
