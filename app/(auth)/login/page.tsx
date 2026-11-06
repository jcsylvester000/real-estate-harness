import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { userCount } from "@/lib/server/services/auth";
import { getCurrentSession } from "@/lib/server/session";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if ((await userCount()) === 0) redirect("/setup");
  if (await getCurrentSession()) redirect("/desktop");
  return (
    <AuthCard title="Sign in" lead="Use the account your GRID admin gave you.">
      <AuthForm
        action={loginAction}
        submit="Sign in"
        fields={[
          { name: "username", label: "Username", autoComplete: "username" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
      />
    </AuthCard>
  );
}
