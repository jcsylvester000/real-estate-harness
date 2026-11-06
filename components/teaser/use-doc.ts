"use client";
/** Editor state: the document with undo/redo. Drags call update(…, false) and commit() on release. */
import { useCallback, useRef, useState } from "react";
import { applyGenerators } from "@/lib/teaser/templates";
import type { El, TeaserDoc } from "@/lib/teaser/types";

export function useDoc(initial: TeaserDoc) {
  const [doc, setDoc] = useState(initial);
  const past = useRef<TeaserDoc[]>([]);
  const future = useRef<TeaserDoc[]>([]);
  const base = useRef<TeaserDoc | null>(null);
  const [hist, setHist] = useState({ p: 0, f: 0 });
  const docRef = useRef(initial);
  const sync = () => setHist({ p: past.current.length, f: future.current.length });

  /** Change the document. commit=false keeps one undo step open (drags, typing in a slider). */
  const update = useCallback((fn: (d: TeaserDoc) => TeaserDoc, commit = true) => {
    const prev = docRef.current;
    const next = fn(prev);
    if (next === prev) return;
    if (!base.current) base.current = prev;
    if (commit) {
      past.current = [...past.current.slice(-79), base.current];
      future.current = [];
      base.current = null;
    }
    docRef.current = next;
    setDoc(next);
    sync();
  }, []);

  const commit = useCallback(() => {
    if (!base.current) return;
    past.current = [...past.current.slice(-79), base.current];
    future.current = [];
    base.current = null;
    sync();
  }, []);

  const undo = useCallback(() => {
    const p = past.current.pop();
    if (!p) return;
    future.current.push(docRef.current);
    base.current = null;
    docRef.current = p;
    setDoc(p);
    sync();
  }, []);
  const redo = useCallback(() => {
    const f = future.current.pop();
    if (!f) return;
    past.current.push(docRef.current);
    docRef.current = f;
    setDoc(f);
    sync();
  }, []);
  const reset = useCallback((d: TeaserDoc) => {
    past.current = [];
    future.current = [];
    base.current = null;
    docRef.current = d;
    setDoc(d);
    sync();
  }, []);

  return { doc, docRef, update, commit, undo, redo, reset, canUndo: hist.p > 0, canRedo: hist.f > 0 };
}

export type DocApi = ReturnType<typeof useDoc>;

/** Update one slide's elements. */
export const editEls = (d: TeaserDoc, slideIdx: number, fn: (els: El[]) => El[]): TeaserDoc => ({
  ...d,
  slides: d.slides.map((s, i) => (i === slideIdx ? { ...s, elements: fn(s.elements) } : s)),
});

/** Details changed: regenerate the lists (amenities, highlights, photos) on slides that use them. */
export const withDetails = (d: TeaserDoc, patch: Partial<TeaserDoc["property"]>): TeaserDoc => applyGenerators({ ...d, property: { ...d.property, ...patch } });
