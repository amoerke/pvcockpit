import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

// next/font lädt die Schrift zur Build-Zeit herunter und liefert sie selbst aus
// (kein Request an Google im Browser). `variable` legt den Namen der
// CSS-Variable fest – shadcn/ui erwartet `--font-sans` (siehe globals.css).
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AmpereSolar Cockpit",
  description: "Statistiken zu den AmpereStorage-Werten",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // next-themes setzt per Inline-Skript die Klasse "dark" am <html>,
      // BEVOR React im Browser übernimmt – sonst blitzte die Seite erst hell
      // auf. Dadurch weicht das <html>-Element absichtlich vom Server-HTML ab.
      // suppressHydrationWarning unterdrückt die Warnung NUR für dieses eine
      // Element (nicht für Kinder). Anderswo wäre der Zusatz ein Warnsignal,
      // dass etwas nicht stimmt – hier ist die Abweichung gewollt.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          // Theme als CSS-Klasse am <html> – passend zu `.dark` in globals.css.
          attribute="class"
          defaultTheme="system"
          enableSystem
          // Beim Umschalten keine CSS-Übergänge abspielen (sonst "wabern"
          // alle Farben einzeln über die Seite).
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
