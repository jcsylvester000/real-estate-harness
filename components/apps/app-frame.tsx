"use client";
import type { GridSDK } from "@/lib/sdk/types";
import { useGrid } from "./use-grid";

/** Renders children once the SDK is ready; explains what to do when the page is opened outside the desktop. */
export function AppFrame({ children }: { children: (grid: GridSDK) => React.ReactNode }) {
  const { grid, error } = useGrid();
  if (error)
    return (
      <div className="app-shell grid place-items-center p-6 text-center">
        <div>
          <p className="font-medium">{error}</p>
          <a href="/desktop" className="mt-2 inline-block text-sm">
            Go to the desktop
          </a>
        </div>
      </div>
    );
  if (!grid)
    return (
      <div className="app-shell grid place-items-center text-sm text-muted" aria-busy="true">
        Loading…
      </div>
    );
  return <>{children(grid)}</>;
}
