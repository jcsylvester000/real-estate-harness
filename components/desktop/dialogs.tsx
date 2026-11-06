"use client";
import { ChevronRight, CircleCheck, FileText, Folder, Info, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PERMISSIONS, type Permission } from "@/lib/apps/permissions";
import { driverCall } from "./api";
import { AppTile } from "./icons";

export type DialogSpec =
  | { kind: "alert"; title?: string; message: string; appName: string }
  | { kind: "confirm"; title?: string; message: string; appName: string; okLabel?: string; danger?: boolean }
  | { kind: "prompt"; title?: string; message: string; appName: string; defaultValue?: string }
  | { kind: "permission"; appName: string; appIcon: string; appUrl: string; permission: Permission }
  | { kind: "pickFile"; appName: string; extensions: string[] };

export interface OpenDialog {
  id: string;
  spec: DialogSpec;
  resolve: (value: unknown) => void;
}

function Shell({ title, onCancel, children, labelId }: { title: string; onCancel: () => void; children: React.ReactNode; labelId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.querySelector<HTMLElement>("[data-autofocus], input, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[9000] grid place-items-center bg-navy/50 p-4 backdrop-blur-[2px]">
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby={labelId} className="card w-full max-w-md p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={labelId} className="font-sans text-base font-semibold">
            {title}
          </h2>
          <button type="button" aria-label="Close" onClick={onCancel} className="grid size-7 place-items-center rounded hover:bg-sand">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FilePicker({ extensions, onPick }: { extensions: string[]; onPick: (v: { path: string; name: string } | null) => void }) {
  const [path, setPath] = useState("/");
  const [items, setItems] = useState<{ path: string; name: string; isDir: boolean }[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    driverCall<{ path: string; name: string; isDir: boolean }[]>("desktop", "fs.list", { path })
      .then((r) => live && setItems(r))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [path]);
  const ok = (name: string) => !extensions.length || extensions.some((x) => name.toLowerCase().endsWith(x.toLowerCase()));
  const crumbs = path.split("/").filter(Boolean);
  return (
    <div>
      <nav aria-label="Folder" className="mb-2 flex flex-wrap items-center gap-1 text-xs">
        <button type="button" className="rounded px-1.5 py-0.5 hover:bg-sand" onClick={() => setPath("/")}>
          Home
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={12} aria-hidden />
            <button type="button" className="rounded px-1.5 py-0.5 hover:bg-sand" onClick={() => setPath("/" + crumbs.slice(0, i + 1).join("/"))}>
              {c}
            </button>
          </span>
        ))}
      </nav>
      <ul className="max-h-72 overflow-auto rounded-lg border border-line bg-white">
        {error && <li className="p-3 text-sm text-bad">{error}</li>}
        {!items && !error && <li className="p-3 text-sm text-muted">Loading…</li>}
        {items?.length === 0 && <li className="p-3 text-sm text-muted">This folder is empty.</li>}
        {items?.map((it) => (
          <li key={it.path}>
            <button
              type="button"
              disabled={!it.isDir && !ok(it.name)}
              onClick={() => (it.isDir ? setPath(it.path) : onPick({ path: it.path, name: it.name }))}
              className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-sand disabled:opacity-40"
            >
              {it.isDir ? <Folder size={16} className="text-bronze-ink" aria-hidden /> : <FileText size={16} aria-hidden />}
              <span className="truncate">{it.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {extensions.length > 0 && <p className="mt-2 text-xs text-muted">Showing files ending in {extensions.join(", ")}</p>}
    </div>
  );
}

function PromptBody({ id, labelId, message, defaultValue, close }: { id: string; labelId: string; message: string; defaultValue: string; close: (id: string, value: unknown) => void }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        close(id, value);
      }}
    >
      <label htmlFor={`${labelId}-in`} className="label">
        {message}
      </label>
      <input id={`${labelId}-in`} className="field" value={value} onChange={(e) => setValue(e.target.value)} maxLength={500} />
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => close(id, null)}>
          Cancel
        </button>
        <button type="submit" className="btn btn-dark">
          OK
        </button>
      </div>
    </form>
  );
}

export function DialogHost({ dialog, close }: { dialog: OpenDialog | undefined; close: (id: string, value: unknown) => void }) {
  if (!dialog) return null;
  const { spec, id } = dialog;
  const labelId = `dlg-${id}`;

  if (spec.kind === "permission") {
    const deny = () => close(id, false);
    return (
      <Shell title="Allow access?" onCancel={deny} labelId={labelId}>
        <div className="flex items-center gap-3">
          <AppTile icon={spec.appIcon} size={44} />
          <div className="min-w-0">
            <p className="font-medium">{spec.appName}</p>
            <p className="truncate text-xs text-muted">{spec.appUrl}</p>
          </div>
        </div>
        <p className="mt-4 text-sm">This third-party app wants to:</p>
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden />
          {PERMISSIONS[spec.permission]}
        </p>
        <p className="mt-3 text-xs text-muted">The app never sees your password or session. You can take this back any time in App Center.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={deny}>
            Don&apos;t allow
          </button>
          <button type="button" className="btn btn-dark" data-autofocus onClick={() => close(id, true)}>
            Allow
          </button>
        </div>
      </Shell>
    );
  }

  if (spec.kind === "pickFile") {
    return (
      <Shell title={`Choose a file for ${spec.appName}`} onCancel={() => close(id, null)} labelId={labelId}>
        <FilePicker extensions={spec.extensions} onPick={(v) => close(id, v)} />
      </Shell>
    );
  }

  const title = spec.title || spec.appName;
  if (spec.kind === "alert")
    return (
      <Shell title={title} onCancel={() => close(id, true)} labelId={labelId}>
        <p className="flex gap-2 text-sm whitespace-pre-wrap">
          <Info size={16} className="mt-0.5 shrink-0 text-info" aria-hidden />
          {spec.message}
        </p>
        <div className="mt-5 flex justify-end">
          <button type="button" className="btn btn-dark" data-autofocus onClick={() => close(id, true)}>
            OK
          </button>
        </div>
      </Shell>
    );
  if (spec.kind === "confirm")
    return (
      <Shell title={title} onCancel={() => close(id, false)} labelId={labelId}>
        <p className="flex gap-2 text-sm whitespace-pre-wrap">
          {spec.danger ? <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden /> : <Info size={16} className="mt-0.5 shrink-0 text-info" aria-hidden />}
          {spec.message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => close(id, false)}>
            Cancel
          </button>
          <button type="button" className={spec.danger ? "btn btn-danger" : "btn btn-dark"} data-autofocus onClick={() => close(id, true)}>
            {spec.okLabel || "OK"}
          </button>
        </div>
      </Shell>
    );
  return (
    <Shell title={title} onCancel={() => close(id, null)} labelId={labelId}>
      <PromptBody key={id} id={id} labelId={labelId} message={spec.message} defaultValue={spec.defaultValue ?? ""} close={close} />
    </Shell>
  );
}

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "ok" | "warn" | "bad";
  source: string;
}

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  const tone = { info: "border-info", ok: "border-ok", warn: "border-warn", bad: "border-bad" };
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed right-3 bottom-16 z-[8000] flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto card flex items-start gap-2 border-l-4 p-3 text-sm ${tone[t.tone]}`}>
          {t.tone === "ok" ? <CircleCheck size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden /> : <Info size={16} className="mt-0.5 shrink-0" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted">{t.source}</p>
            <p className="break-words">{t.message}</p>
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="grid size-6 place-items-center rounded hover:bg-sand">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
