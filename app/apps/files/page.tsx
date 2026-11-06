"use client";
import { ArrowUp, ChevronRight, Download, FilePlus, FileText, Folder, FolderPlus, Pencil, RefreshCw, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { errText } from "@/components/apps/use-grid";
import type { FsEntry, GridSDK } from "@/lib/sdk/types";

const size = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const join = (dir: string, name: string) => (dir === "/" ? `/${name}` : `${dir}/${name}`);
const parent = (p: string) => (p.lastIndexOf("/") <= 0 ? "/" : p.slice(0, p.lastIndexOf("/")));

function Files({ grid }: { grid: GridSDK }) {
  const [path, setPath] = useState(typeof grid.launchArgs.path === "string" ? grid.launchArgs.path : "/");
  const [items, setItems] = useState<FsEntry[] | null>(null);
  const [error, setError] = useState("");
  const upload = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const list = await grid.fs.list(path);
      setError("");
      setItems(list);
      grid.ui.setTitle(path === "/" ? "Files" : `Files · ${path}`);
    } catch (e) {
      setError(errText(e));
      setItems([]);
    }
  }, [grid, path]);
  useEffect(() => {
    // Data load on mount and when the folder changes; state updates happen after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) grid.ui.notify(ok, { tone: "ok" });
      load();
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };

  const newFolder = async () => {
    const name = await grid.ui.prompt("Folder name", "New folder");
    if (name) act(() => grid.fs.mkdir(join(path, name)));
  };
  const newNote = async () => {
    const name = await grid.ui.prompt("File name", "Untitled.md");
    if (!name) return;
    const p = join(path, name);
    act(async () => {
      await grid.fs.write(p, "", { overwrite: false });
      await grid.ui.openFile(p);
    });
  };
  const rename = async (it: FsEntry) => {
    const name = await grid.ui.prompt("New name", it.name);
    if (name && name !== it.name) act(() => grid.fs.rename(it.path, join(parent(it.path), name)));
  };
  const remove = async (it: FsEntry) => {
    if (await grid.ui.confirm(`Delete ${it.isDir ? "the folder" : ""} "${it.name}"${it.isDir ? " and everything in it" : ""}?`, { danger: true, okLabel: "Delete" }))
      act(() => grid.fs.delete(it.path), "Deleted.");
  };
  const download = async (it: FsEntry) => {
    try {
      const f = await grid.fs.read(it.path);
      const bytes = f.encoding === "base64" ? Uint8Array.from(atob(f.content), (c) => c.charCodeAt(0)) : new TextEncoder().encode(f.content);
      const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = it.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };
  const onUpload = async (fl: FileList | null) => {
    for (const file of Array.from(fl ?? [])) {
      if (file.size > 1024 * 1024) {
        grid.ui.notify(`${file.name} is over 1 MB.`, { tone: "warn" });
        continue;
      }
      const isText = /^text\/|json|markdown/.test(file.type) || /\.(txt|md|csv|json)$/i.test(file.name);
      const content = isText
        ? await file.text()
        : await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result).split(",")[1] ?? "");
            r.onerror = () => rej(r.error);
            r.readAsDataURL(file);
          });
      await act(() => grid.fs.write(join(path, file.name), content, { encoding: isText ? "utf8" : "base64", mime: file.type || undefined }), `Uploaded ${file.name}.`);
    }
    if (upload.current) upload.current.value = "";
  };

  const crumbs = path.split("/").filter(Boolean);
  return (
    <div className="app-shell">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-white px-2 py-2">
        <button type="button" aria-label="Up one folder" disabled={path === "/"} onClick={() => setPath(parent(path))} className="grid size-8 place-items-center rounded hover:bg-sand disabled:opacity-40">
          <ArrowUp size={15} />
        </button>
        <nav aria-label="Folder path" className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-sm">
          <button type="button" onClick={() => setPath("/")} className="rounded px-1.5 py-1 hover:bg-sand">
            Home
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center">
              <ChevronRight size={13} className="text-muted" aria-hidden />
              <button type="button" onClick={() => setPath("/" + crumbs.slice(0, i + 1).join("/"))} className="rounded px-1.5 py-1 hover:bg-sand">
                {c}
              </button>
            </span>
          ))}
        </nav>
        <button type="button" className="btn btn-ghost min-h-8 px-2.5 text-xs" onClick={newFolder}>
          <FolderPlus size={14} aria-hidden /> Folder
        </button>
        <button type="button" className="btn btn-ghost min-h-8 px-2.5 text-xs" onClick={newNote}>
          <FilePlus size={14} aria-hidden /> Note
        </button>
        <button type="button" className="btn btn-ghost min-h-8 px-2.5 text-xs" onClick={() => upload.current?.click()}>
          <Upload size={14} aria-hidden /> Upload
        </button>
        <input ref={upload} type="file" multiple className="sr-only" aria-label="Upload files" onChange={(e) => onUpload(e.target.files)} />
        <button type="button" aria-label="Refresh" className="grid size-8 place-items-center rounded hover:bg-sand" onClick={load}>
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error && (
          <p role="alert" className="m-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
        {items?.length === 0 && !error && <p className="p-8 text-center text-sm text-muted">This folder is empty.</p>}
        <ul aria-label="Files">
          {items?.map((it) => (
            <li key={it.path} className="group flex items-center gap-2 border-b border-line px-3 hover:bg-white">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left text-sm"
                onDoubleClick={() => (it.isDir ? setPath(it.path) : grid.ui.openFile(it.path))}
                onClick={(e) => e.detail === 0 && (it.isDir ? setPath(it.path) : grid.ui.openFile(it.path))}
                title={it.isDir ? "Open folder" : "Open file"}
              >
                {it.isDir ? <Folder size={18} className="shrink-0 text-bronze-ink" aria-hidden /> : <FileText size={18} className="shrink-0 text-ink-2" aria-hidden />}
                <span className="truncate">{it.name}</span>
              </button>
              <span className="hidden w-20 text-right text-xs text-muted tabular-nums sm:block">{it.isDir ? "" : size(it.size)}</span>
              <span className="hidden w-36 text-right text-xs text-muted sm:block">{new Date(it.updatedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</span>
              <span className="flex">
                {!it.isDir && (
                  <button type="button" aria-label={`Download ${it.name}`} onClick={() => download(it)} className="grid size-8 place-items-center rounded text-muted hover:bg-sand">
                    <Download size={14} />
                  </button>
                )}
                <button type="button" aria-label={`Rename ${it.name}`} onClick={() => rename(it)} className="grid size-8 place-items-center rounded text-muted hover:bg-sand">
                  <Pencil size={14} />
                </button>
                <button type="button" aria-label={`Delete ${it.name}`} onClick={() => remove(it)} className="grid size-8 place-items-center rounded text-muted hover:bg-bad-soft hover:text-bad">
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="border-t border-line bg-white px-3 py-1.5 text-[11px] text-muted">Double-click to open. Files up to 1 MB; 50 MB per person.</p>
    </div>
  );
}

export default function FilesPage() {
  return <AppFrame>{(grid) => <Files grid={grid} />}</AppFrame>;
}
