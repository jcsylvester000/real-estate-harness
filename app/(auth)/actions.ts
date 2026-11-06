"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logout } from "@/lib/server/services/auth";
import { unlockWithPin } from "@/lib/server/services/pin";
import { clearSessionCookie, clientAddress, currentToken, isSameOrigin, setSessionCookie } from "@/lib/server/session";

export type FormState = { error?: string; locked?: boolean } | undefined;

/** PIN modal submit: a correct PIN starts a shared team session. */
export async function unlockAction(_: FormState, form: FormData): Promise<FormState> {
  if (!(await isSameOrigin())) return { error: "Please reload the page and try again." };
  const res = await unlockWithPin(String(form.get("pin") ?? ""), await clientAddress(), (await headers()).get("user-agent") ?? undefined);
  if (!res.ok) return { error: res.reason, locked: res.locked };
  await setSessionCookie(res.token);
  redirect("/desktop");
}

/** "Lock" in the start menu: ends this session; the PIN modal shows again. */
export async function lockAction() {
  await logout(await currentToken());
  await clearSessionCookie();
  redirect("/desktop");
}
