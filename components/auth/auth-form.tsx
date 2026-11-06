"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/(auth)/actions";

export interface Field {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
}

export function AuthForm({ action, fields, submit }: { action: (s: FormState, f: FormData) => Promise<FormState>; fields: Field[]; submit: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="label">
            {f.label}
          </label>
          <input id={f.name} name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} required className="field" aria-describedby={f.hint ? `${f.name}-hint` : undefined} />
          {f.hint && (
            <p id={`${f.name}-hint`} className="mt-1 text-xs text-muted">
              {f.hint}
            </p>
          )}
        </div>
      ))}
      {state?.error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Please wait…" : submit}
      </button>
    </form>
  );
}
