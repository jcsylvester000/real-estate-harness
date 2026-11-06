import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { userCount } from "@/lib/server/services/auth";
import { setupAction } from "../actions";

export const metadata: Metadata = { title: "First-time setup" };
export const dynamic = "force-dynamic";

/** Only reachable while the database has no users: creates the first admin. */
export default async function SetupPage() {
  if ((await userCount()) > 0) redirect("/login");
  return (
    <AuthCard title="Create the admin account" lead="First-time setup. This page closes as soon as one account exists.">
      <AuthForm
        action={setupAction}
        submit="Create admin and sign in"
        fields={[
          { name: "displayName", label: "Your name", autoComplete: "name" },
          { name: "username", label: "Username", autoComplete: "username", hint: "3-32 letters, numbers, dots, dashes or underscores." },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 15 characters. A phrase of a few words works well." },
          { name: "confirm", label: "Repeat password", type: "password", autoComplete: "new-password" },
        ]}
      />
    </AuthCard>
  );
}
