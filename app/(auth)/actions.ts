"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DriverError } from "@/lib/server/errors";
import { changePassword, login, setupFirstAdmin, userCount } from "@/lib/server/services/auth";
import { clearSessionCookie, getCurrentSession, isSameOrigin, setSessionCookie } from "@/lib/server/session";

export type FormState = { error?: string } | undefined;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").slice(0, 200);

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  if (!(await isSameOrigin())) return { error: "Please reload the page and try again." };
  const res = await login(str(form, "username").trim(), str(form, "password"), (await headers()).get("user-agent") ?? undefined);
  if (!res.ok) return { error: res.reason };
  await setSessionCookie(res.token);
  redirect(res.user.mustChangePassword ? "/change-password" : "/desktop");
}

export async function setupAction(_: FormState, form: FormData): Promise<FormState> {
  if (!(await isSameOrigin())) return { error: "Please reload the page and try again." };
  if ((await userCount()) > 0) redirect("/login");
  const password = str(form, "password");
  if (password !== str(form, "confirm")) return { error: "The two passwords do not match." };
  try {
    await setupFirstAdmin({ username: str(form, "username").trim(), password, displayName: str(form, "displayName").trim() });
  } catch (err) {
    if (err instanceof DriverError) return { error: err.message };
    throw err;
  }
  const res = await login(str(form, "username").trim(), password);
  if (res.ok) await setSessionCookie(res.token);
  redirect("/desktop");
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  if (!(await isSameOrigin())) return { error: "Please reload the page and try again." };
  const s = await getCurrentSession();
  if (!s) redirect("/login");
  const next = str(form, "next");
  if (next !== str(form, "confirm")) return { error: "The two new passwords do not match." };
  try {
    await changePassword(s.user.id, str(form, "current"), next, s.sessionId);
  } catch (err) {
    if (err instanceof DriverError) return { error: err.message };
    throw err;
  }
  redirect("/desktop");
}

export async function logoutAction() {
  const { logout } = await import("@/lib/server/services/auth");
  const { currentToken } = await import("@/lib/server/session");
  await logout(await currentToken());
  await clearSessionCookie();
  redirect("/login");
}
