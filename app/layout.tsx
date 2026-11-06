import type { Metadata, Viewport } from "next";
import { cantata, poppins } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Grid Agentic", template: "%s · Grid Agentic" },
  description: "GRID Property Ventures' AI desktop for brokers and salespersons.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#0e192f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PH" className={`${cantata.variable} ${poppins.variable}`}>
      <body>{children}</body>
    </html>
  );
}
