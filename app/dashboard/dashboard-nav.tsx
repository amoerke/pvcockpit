/**
 * Navigation im Dashboard – eine kleine CLIENT Component.
 *
 * Warum Client? Um den aktiven Menüpunkt hervorzuheben, brauchen wir den
 * aktuellen Pfad. `usePathname()` ist ein Hook und funktioniert nur im
 * Browser-Teil. Das Layout drumherum bleibt eine Server Component – nur
 * dieses kleine Stück wird zu JavaScript im Browser.
 *
 * Und weil das Layout beim Seitenwechsel nicht neu rendert (Partial
 * Rendering), MUSS die Hervorhebung im Client passieren: Nur der Hook
 * bekommt den Pfadwechsel mit.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Übersicht" },
  { href: "/dashboard/history", label: "Verlauf" },
] as const;

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Hauptnavigation" className="flex items-center gap-1">
      {NAV_ITEMS.map(({ href, label }) => {
        const isActive = pathname === href;

        return (
          <Link
            key={href}
            href={href}
            // aria-current sagt Screenreadern "du bist hier" – und dient
            // gleichzeitig als Styling-Haken (aria-[current=page]:…).
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
              "aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
