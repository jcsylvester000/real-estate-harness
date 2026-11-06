"use client";
import Image from "next/image";
import { Lock } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { unlockAction, type FormState } from "@/app/(auth)/actions";

const LENGTH = 4;

/** The lock screen: wallpaper + a PIN pop-up. Four boxes, auto-submits on the fourth digit. */
export function PinGate() {
  const [state, action, pending] = useActionState<FormState, FormData>(unlockAction, undefined);
  const [pin, setPin] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.error) {
      // A wrong PIN clears the boxes for the next try.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPin("");
      input.current?.focus();
    }
  }, [state]);

  return (
    <main className="wall-grid relative grid h-dvh place-items-center px-4">
      <h1 className="sr-only">Grid Agentic is locked</h1>
      <div role="dialog" aria-modal="true" aria-labelledby="pin-title" className="card w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-navy">
          <Image src="/icon.svg" alt="" width={34} height={34} priority />
        </div>
        <h2 id="pin-title" className="text-2xl">
          Grid Agentic
        </h2>
        <p className="mt-1 text-sm text-muted">Enter the team PIN to open the desktop.</p>
        <form
          ref={form}
          action={action}
          className="mt-5"
          onSubmit={(e) => {
            if (pin.length !== LENGTH) e.preventDefault();
          }}
        >
          <label htmlFor="pin" className="sr-only">
            PIN
          </label>
          <div className="relative mx-auto w-fit" onClick={() => input.current?.focus()}>
            <input
              ref={input}
              id="pin"
              name="pin"
              value={pin}
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={LENGTH}
              disabled={pending || state?.locked}
              aria-invalid={!!state?.error}
              aria-describedby={state?.error ? "pin-error" : undefined}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, LENGTH);
                setPin(v);
                if (v.length === LENGTH) setTimeout(() => form.current?.requestSubmit(), 0);
              }}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            />
            <div className="flex gap-3" aria-hidden>
              {Array.from({ length: LENGTH }, (_, i) => (
                <span
                  key={i}
                  className={`grid size-14 place-items-center rounded-xl border-2 text-2xl ${i === pin.length && !pending ? "border-bronze" : "border-line-2"} ${state?.error && !pin ? "border-bad/60" : ""} bg-white`}
                >
                  {pin[i] ? "•" : ""}
                </span>
              ))}
            </div>
          </div>
          {state?.error && (
            <p id="pin-error" role="alert" className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
              {state.error}
            </p>
          )}
          <button type="submit" className="btn btn-dark mt-5 w-full" disabled={pending || pin.length !== LENGTH || state?.locked}>
            <Lock size={15} aria-hidden /> {pending ? "Checking…" : "Unlock"}
          </button>
        </form>
        <p className="mt-4 text-[11px] text-muted">For GRID staff. Keep client IDs, TINs and bank details out of AI chats.</p>
      </div>
    </main>
  );
}
