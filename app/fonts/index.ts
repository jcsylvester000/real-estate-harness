import localFont from "next/font/local";

// Self-hosted brand fonts (SIL Open Font License; files from Fontsource). PF-07: no external font requests.
export const cantata = localFont({
  src: "./cantata-one-latin-400-normal.woff2",
  weight: "400",
  display: "swap",
  variable: "--font-cantata",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const poppins = localFont({
  src: [
    { path: "./poppins-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./poppins-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./poppins-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-poppins",
  fallback: ["Segoe UI", "system-ui", "Arial", "sans-serif"],
});
