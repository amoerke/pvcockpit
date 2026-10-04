import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
