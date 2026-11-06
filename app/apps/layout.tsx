import Script from "next/script";
import { SpotlightTracker } from "@/components/apps/spotlight";
import { requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Built-in apps: each page runs inside a desktop window and talks to it only through grid.js. */
export default async function AppsLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <Script src="/sdk/grid.js" strategy="afterInteractive" />
      {/* Dev only: the Next.js indicator sits top-right on the desktop; inside app windows it would cover controls. */}
      {process.env.NODE_ENV === "development" && <style>{"nextjs-portal{display:none!important}"}</style>}
      <SpotlightTracker />
      {children}
    </>
  );
}
