/** The desktop's own fetch to the driver endpoint. Apps never call this; they go through grid.js and the IPC gate. */
export class CallError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function driverCall<T = unknown>(appId: string, method: string, params: unknown = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/drivers/call", {
      method: "POST",
      headers: { "content-type": "application/json", "x-grid-app": appId },
      body: JSON.stringify({ method, params }),
      credentials: "same-origin",
    });
  } catch {
    throw new CallError("offline", "Could not reach the server. Check your connection.");
  }
  let data: { ok: boolean; result?: T; error?: { code: string; message: string } };
  try {
    data = await res.json();
  } catch {
    throw new CallError("server_error", `The server answered with HTTP ${res.status}.`);
  }
  if (res.status === 401 || data.error?.code === "signed_out") {
    window.location.assign(new URL("/login", window.location.origin).href);
    throw new CallError("signed_out", "Your session has ended.");
  }
  if (!data.ok) throw new CallError(data.error?.code ?? "error", data.error?.message ?? "Request failed.");
  return data.result as T;
}
