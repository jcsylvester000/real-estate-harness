/** GET /api/teaser-assets/<id>: a Property Teaser image, for its owner only (session cookie). */
import { NextResponse } from "next/server";
import { readAsset } from "@/lib/server/services/teasers";
import { getCurrentSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getCurrentSession();
  if (!session) return new NextResponse("Locked", { status: 401 });
  if (!UUID.test(id)) return new NextResponse("Not found", { status: 404 });
  const a = await readAsset(session.user.id, id);
  if (!a) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(a.body), {
    headers: {
      "content-type": a.mime,
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
