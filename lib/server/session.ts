import "server-only";
/** Session cookie, current-user guards and the same-origin check for every mutating request. */
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { LIMITS, validateSession, type ActiveSession } from "./services/auth";

export const SESSION_COOKIE = "ga_session";

const appOrigin = () => process.env.APP_ORIGIN ?? "http://localhost:3000";
const secure = () => appOrigin().startsWith("https://");

export async function setSessionCookie(token: string) {
  // SameSite=Lax: a sandboxed (opaque-origin) or cross-site app iframe cannot send the session on its own
  // requests; the driver endpoint also requires a same-origin Origin header. Only the desktop calls drivers.
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(LIMITS.sessionAbsoluteMs / 1000),
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function currentToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export const getCurrentSession = cache(async (): Promise<ActiveSession | null> => validateSession(await currentToken()));

/** Pages inside the desktop: no session means the desktop shows the PIN modal. */
export async function requireUser(): Promise<ActiveSession> {
  const s = await getCurrentSession();
  if (!s) redirect("/desktop");
  return s;
}

/** Network address for the PIN lockout. Used only as a keyed hash. */
export async function clientAddress() {
  const h = await headers();
  return h.get("x-nf-client-connection-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function requireAdmin() {
  const s = await requireUser();
  if (s.user.role !== "admin") notFound();
  return s;
}

const originOf = (u: string | null | undefined) => {
  try {
    return u ? new URL(u).origin : null;
  } catch {
    return null;
  }
};

/** True when the browser's Origin is APP_ORIGIN or the host this request was served on. */
export async function isSameOrigin() {
  const h = await headers();
  const origin = originOf(h.get("origin"));
  if (!origin) return false;
  if (origin === originOf(appOrigin())) return true;
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  return !!host && new URL(origin).host.toLowerCase() === host;
}
