import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentSession } from "@/lib/server/session";
import { changePasswordAction } from "../actions";

export const metadata: Metadata = { title: "Change password" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const s = await getCurrentSession();
  if (!s) redirect("/login");
  return (
    <AuthCard title="Choose a new password" lead={s.user.mustChangePassword ? "Your admin set a temporary password. Choose your own to continue." : undefined}>
      <AuthForm
        action={changePasswordAction}
        submit="Save and open the desktop"
        fields={[
          { name: "current", label: "Current (temporary) password", type: "password", autoComplete: "current-password" },
          { name: "next", label: "New password", type: "password", autoComplete: "new-password", hint: "At least 15 characters." },
          { name: "confirm", label: "Repeat new password", type: "password", autoComplete: "new-password" },
        ]}
      />
    </AuthCard>
  );
}
