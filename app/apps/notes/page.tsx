"use client";
import { Eye, FolderOpen, Pencil, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { Markdown } from "@/components/apps/markdown";
import { errText } from "@/components/apps/use-grid";
import type { GridSDK } from "@/lib/sdk/types";

function Notes({ grid }: { grid: GridSDK }) {
  const [path, setPath] = useState<string | null>(typeof grid.launchArgs.path === "string" ? grid.launchArgs.path : null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState("");
  const dirty = text !== saved;
  const name = path ? path.slice(path.lastIndexOf("/") + 1) : "Untitled";

  useEffect(() => {
    grid.ui.setTitle(`${dirty ? "• " : ""}${name} · Notes`);
  }, [grid, name, dirty]);

  const open = useCallback(
    async (p: string) => {
      try {
        const f = await grid.fs.read(p);
        if (f.encoding !== "utf8") throw new Error("This file is not text.");
        setPath(p);
        setText(f.content);
        setSaved(f.content);
        setPreview(p.endsWith(".md"));
      } catch (e) {
        setStatus(errText(e));
      }
    },
    [grid],
  );

  useEffect(() => {
    // Opens the launch file once; state updates happen after the read resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof grid.launchArgs.path === "string") open(grid.launchArgs.path);
  }, [grid, open]);

  const save = useCallback(
    async (asNew = false) => {
      let p = path;
      if (!p || asNew) {
        p = await grid.ui.prompt("Save as", path ?? "/Documents/Untitled.md");
        if (!p) return;
      }
      try {
        await grid.fs.write(p, text, { createParents: true });
        setPath(p);
        setSaved(text);
        setStatus(`Saved ${new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" })}`);
      } catch (e) {
        setStatus(errText(e));
      }
    },
    [grid, path, text],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const pick = async () => {
    if (dirty && !(await grid.ui.confirm("Discard unsaved changes?", { okLabel: "Discard" }))) return;
    const f = await grid.ui.pickFile({ extensions: [".md", ".txt", ".csv", ".json"] });
    if (f) open(f.path);
  };

  return (
    <div className="app-shell">
      <div className="flex items-center gap-1 border-b border-line bg-white px-2 py-2">
        <button type="button" className="btn btn-ghost min-h-8 px-2.5 text-xs" onClick={pick}>
          <FolderOpen size={14} aria-hidden /> Open
        </button>
        <button type="button" className="btn btn-dark min-h-8 px-2.5 text-xs" onClick={() => save()} disabled={!dirty && !!path}>
          <Save size={14} aria-hidden /> Save
        </button>
        <button type="button" className="btn btn-ghost min-h-8 px-2.5 text-xs" onClick={() => save(true)}>
          Save as
        </button>
        <button type="button" className="btn btn-ghost ml-auto min-h-8 px-2.5 text-xs" aria-pressed={preview} onClick={() => setPreview((p) => !p)}>
          {preview ? <Pencil size={14} aria-hidden /> : <Eye size={14} aria-hidden />} {preview ? "Edit" : "Preview"}
        </button>
      </div>
      {preview ? (
        <div className="min-h-0 flex-1 overflow-auto bg-white p-5">
          <Markdown text={text || "_Empty note_"} className="mx-auto max-w-2xl text-sm" />
        </div>
      ) : (
        <>
          <label htmlFor="note" className="sr-only">
            Note text
          </label>
          <textarea id="note" value={text} onChange={(e) => setText(e.target.value)} spellCheck className="min-h-0 w-full flex-1 resize-none bg-white p-5 font-mono text-[13px] leading-relaxed focus:outline-none" placeholder="Start writing…" />
        </>
      )}
      <p className="border-t border-line bg-white px-3 py-1.5 text-[11px] text-muted" role="status">
        {path ?? "Not saved yet"} {status && `· ${status}`} · Ctrl+S saves
      </p>
    </div>
  );
}

export default function NotesPage() {
  return <AppFrame>{(grid) => <Notes grid={grid} />}</AppFrame>;
}
