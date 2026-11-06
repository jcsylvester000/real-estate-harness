import type { Metadata } from "next";
import { Desktop } from "@/components/desktop/desktop";
import { WALLPAPERS } from "@/lib/apps/wallpapers";
import { listApps } from "@/lib/server/services/apps";
import { kvGet } from "@/lib/server/services/kv";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Desktop" };
export const dynamic = "force-dynamic";

export default async function DesktopPage() {
  const { user } = await requireUser();
  const [apps, wallpaper] = await Promise.all([listApps(user.role), kvGet(user.id, "desktop", "wallpaper")]);
  return (
    <Desktop
      user={{ displayName: user.displayName, username: user.username, role: user.role, publicId: user.publicId }}
      initialApps={apps}
      initialWallpaper={(WALLPAPERS as readonly string[]).includes(String(wallpaper)) ? String(wallpaper) : "wall-grid"}
    />
  );
}
