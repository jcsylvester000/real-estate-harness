import { redirect } from "next/navigation";

/** Sign-in is replaced by the PIN modal on the desktop (see components/desktop/pin-gate.tsx). */
export default function Page() {
  redirect("/desktop");
}
