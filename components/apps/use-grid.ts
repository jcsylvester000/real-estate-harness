"use client";
import { useEffect, useState } from "react";
import type { GridSDK } from "@/lib/sdk/types";

/** Waits for /sdk/grid.js to load and the desktop handshake to finish. */
export function useGrid() {
  const [grid, setGrid] = useState<GridSDK | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const started = Date.now();
    const poll = () => {
      if (!live) return;
      if (window.grid) {
        window.grid.ready.then((g) => live && setGrid(g)).catch((e: Error) => live && setError(e.message));
      } else if (Date.now() - started > 10_000) setError("The app SDK did not load.");
      else setTimeout(poll, 50);
    };
    poll();
    return () => {
      live = false;
    };
  }, []);
  return { grid, error };
}

/** Error message from a grid call, safe to show. */
export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
