import type { Metadata } from "next";
import { Desktop } from "@/components/desktop/desktop";
import { WALLPAPERS } from "@/lib/apps/wallpapers";
import { aiStatus } from "@/lib/server/services/ai";
import { listApps } from "@/lib/server/services/apps";
import { kvGet } from "@/lib/server/services/kv";
import { PinGate } from "@/components/desktop/pin-gate";
import { parseLayout } from "@/lib/apps/icon-layout";
import { getCurrentSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Desktop" };
export const dynamic = "force-dynamic";

export default async function DesktopPage() {
  const session = await getCurrentSession();
  if (!session) return <PinGate />;
  const { user } = session;
  const [apps, wallpaper, icons] = await Promise.all([listApps(user.role), kvGet(user.id, "desktop", "wallpaper"), kvGet(user.id, "desktop", "icons")]);
  return (
    <Desktop
      user={{ displayName: user.displayName, username: user.username, role: user.role, publicId: user.publicId }}
      initialApps={apps}
      initialIcons={parseLayout(icons)}
      ai={(() => {
        const st = aiStatus();
        return { realAi: st.realAi, providers: st.providers.filter((p) => p.configured && p.id !== "demo").map((p) => p.label.split(" ")[0]!) };
      })()}
      initialWallpaper={(WALLPAPERS as readonly string[]).includes(String(wallpaper)) ? String(wallpaper) : "wall-grid"}
    />
  );
}
