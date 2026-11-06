/**
 * POST /api/drivers/call  { method, params }  with header x-grid-app: <app id>
 * The single RPC endpoint behind grid.js. Only the desktop calls it: same-origin requests with the
 * session cookie. Responses: { ok: true, result } or { ok: false, error: { code, message } }.
 */
import { NextResponse } from "next/server";
import { callDriver } from "@/lib/server/drivers";
import { DriverError } from "@/lib/server/errors";
import { resolveApp } from "@/lib/server/services/apps";
import { getCurrentSession, isSameOrigin } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Listing CSV imports are the largest calls; Netlify functions accept about 6 MB per request.
const MAX_BODY = 6 * 1024 * 1024;
const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ ok: false, error: { code, message } }, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  if (!(await isSameOrigin())) return fail("bad_origin", "Requests must come from the Grid Agentic desktop.", 403);
  const session = await getCurrentSession();
  if (!session) return fail("signed_out", "The desktop is locked. Enter the PIN again.", 401);

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return fail("too_large", "Request is too large (6 MB max).", 413);
  let body: { method?: unknown; params?: unknown };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return fail("too_large", "Request is too large (6 MB max).", 413);
    body = JSON.parse(text);
  } catch {
    return fail("invalid_json", "Body must be JSON.", 400);
  }
  const appId = req.headers.get("x-grid-app") ?? "";
  const app = await resolveApp(appId);
  if (!app) return fail("unknown_app", "Unknown or disabled app.", 403);
  if (typeof body.method !== "string") return fail("invalid_input", "Missing method.", 400);

  try {
    const result = await callDriver({ user: session.user, sessionId: session.sessionId, app }, body.method, body.params);
    return NextResponse.json({ ok: true, result: result ?? null }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof DriverError) return fail(err.code, err.message, err.status);
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined;
    console.error(JSON.stringify({ event: "driver_error", method: body.method, app: appId, message: message.slice(0, 300), cause: cause?.slice(0, 300) }));
    // Provider errors (AI API down, timeouts) are safe to show in short form; anything else stays generic.
    if (/^(Provider returned HTTP|Network error|No API key)/.test(message)) return fail("provider_error", message.slice(0, 200), 502);
    return fail("server_error", "Something went wrong. Try again.", 500);
  }
}
