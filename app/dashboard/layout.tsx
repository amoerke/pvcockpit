/**
 * Gemeinsames Layout für alle Seiten unter /dashboard (Server Component).
 *
 * Ein layout.tsx umschließt alle Seiten in seinem Ordner und dessen
 * Unterordnern:
 *
 *   app/layout.tsx              ← Root-Layout (<html>, <body>, Theme)
 *   └── app/dashboard/layout.tsx  ← dieses Layout (Kopfzeile, Navigation)
 *       ├── page.tsx              → /dashboard
 *       └── history/page.tsx      → /dashboard/history
 *
 * Beim Wechsel zwischen /dashboard und /dashboard/history rendert Next.js nur
 * die Seite neu – das Layout bleibt stehen ("Partial Rendering"). Das ist
 * schnell, hat aber eine Konsequenz für die Sicherheit:
 *
 *   Dieses Layout ist NICHT die Auth-Prüfung. Es ruft verifySession() nur
 *   auf, um die E-Mail anzuzeigen. Die verbindliche Prüfung steht in jeder
 *   page.tsx – die rendert bei jedem Seitenwechsel neu.
 *
 * Doppelte Aufrufe von verifySession() (Layout + Seite) kosten nichts extra:
 * React `cache()` sorgt für genau eine Anfrage an den Auth-Server pro Request.
 */
import { LogOut } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";
import { verifySession } from "@/lib/dal";

import { DashboardNav } from "./dashboard-nav";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const user = await verifySession();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-medium">AmpereSolar Cockpit</span>
          <DashboardNav />
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-2 text-sm text-muted-foreground">{user.email}</span>
          <ThemeToggle />
          <form action={logout}>
            <Button variant="outline" type="submit">
              <LogOut data-icon="inline-start" />
              Abmelden
            </Button>
          </form>
        </div>
      </header>

      {children}
    </div>
  );
}
