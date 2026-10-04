/**
 * Umschalter Hell / Dunkel / System.
 *
 * next-themes speichert die Wahl im localStorage und setzt die Klasse "dark"
 * am <html>-Element. Die shadcn-Farben (globals.css, Block `.dark`) reagieren
 * darauf automatisch.
 */
"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  // `theme` ist auf dem Server (und beim allerersten Rendern im Browser)
  // `undefined` – erst im Browser lässt sich localStorage lesen. Deshalb
  // hängt hier NICHTS Sichtbares direkt von `theme` ab, sonst wiche das
  // Server-HTML vom Client-HTML ab (Hydration-Fehler). Das Menü mit der
  // Auswahl wird ohnehin erst beim Öffnen gerendert – dann im Browser.
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      {/* Base UI: `render` statt Radix' `asChild` – der Trigger wird als
          unser shadcn-Button gerendert und bekommt dessen Styles. */}
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Farbschema wählen" />}
      >
        {/* Beide Icons sind immer im HTML; CSS blendet je nach Klasse `dark`
            eines aus. So sieht Server- und Client-HTML gleich aus, und das
            richtige Icon erscheint ohne Flackern. */}
        <Sun className="dark:hidden" />
        <Moon className="hidden dark:block" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Farbschema</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light">
              <Sun /> Hell
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon /> Dunkel
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor /> System
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
