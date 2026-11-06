import Script from "next/script";
import { requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Built-in apps: each page runs inside a desktop window and talks to it only through grid.js. */
export default async function AppsLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <Script src="/sdk/grid.js" strategy="afterInteractive" />
      {children}
    </>
  );
}
