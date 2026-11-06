// Minimal JSON POST with timeout and retry on rate limits / server errors, shared by all adapters.

export class ProviderError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: string) {
    super(message);
  }
}

export interface PostOptions {
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

/** POSTs JSON and returns the parsed response. Retries 429 and 5xx with exponential backoff. */
export async function postJson(url: string, headers: Record<string, string>, body: unknown, opts: PostOptions = {}): Promise<any> {
  const { timeoutMs = 60_000, retries = 2, fetchImpl = fetch } = opts;
  let lastError: ProviderError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      if (res.ok) return JSON.parse(text);
      lastError = new ProviderError(`Provider returned HTTP ${res.status}: ${text.slice(0, 500)}`, res.status, text);
      if (res.status !== 429 && res.status < 500) throw lastError;
    } catch (err) {
      if (err instanceof ProviderError && err.status && err.status !== 429 && err.status < 500) throw err;
      lastError = err instanceof ProviderError ? err : new ProviderError(`Network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
  }
  throw lastError ?? new ProviderError("Unknown provider error");
}
