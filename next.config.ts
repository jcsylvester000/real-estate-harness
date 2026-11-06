import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
/** Extra origins allowed to be framed as third-party apps, space-separated (e.g. "https://apps.example.com"). */
const appOrigins = (process.env.GRID_APP_ORIGINS ?? "").split(/\s+/).filter((o) => /^https:\/\/[\w.-]+(:\d+)?$/.test(o));

/**
 * Security headers. Apps are framed only by this site (frame-ancestors 'self'). Next.js writes small inline
 * scripts for hydration, so script-src keeps 'unsafe-inline'; development also needs 'unsafe-eval'.
 */
const csp = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' lets the self-hosted OCR engine (tesseract.js WebAssembly) run; it does not allow eval().
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  `frame-src 'self' ${appOrigins.join(" ")}`.trim(),
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Dev-only Next.js badge: top-right of the desktop, away from app windows' inputs (never shown in production).
  devIndicators: { position: "top-right" },
  reactStrictMode: true,
  serverExternalPackages: ["@node-rs/argon2", "@electric-sql/pglite"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The SDK is loaded by third-party apps on other origins.
      { source: "/sdk/:file*", headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }, { key: "Cache-Control", value: "public, max-age=300" }] },
    ];
  },
};

export default nextConfig;
