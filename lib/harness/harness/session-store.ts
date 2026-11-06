// Conversation memory per client session. In-memory by default; implement SessionStore with
// Redis or PostgreSQL for production so sessions survive restarts and scale across servers.

import type { ChatMessage } from "./types";

export interface SessionStore {
  get(sessionId: string): Promise<ChatMessage[]>;
  save(sessionId: string, messages: ChatMessage[]): Promise<void>;
  clear(sessionId: string): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, { messages: ChatMessage[]; touchedAt: number }>();

  constructor(private readonly ttlMs = 2 * 60 * 60 * 1000) {}

  async get(sessionId: string): Promise<ChatMessage[]> {
    this.evictExpired();
    return [...(this.sessions.get(sessionId)?.messages ?? [])];
  }

  async save(sessionId: string, messages: ChatMessage[]): Promise<void> {
    this.sessions.set(sessionId, { messages, touchedAt: Date.now() });
  }

  async clear(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  private evictExpired(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, s] of this.sessions) if (s.touchedAt < cutoff) this.sessions.delete(id);
  }
}

/**
 * Keeps only the last `turns` user turns (with their tool exchanges) to cap token spend.
 * Always cuts at a user message so a tool call is never separated from its result.
 */
export function trimHistory(messages: ChatMessage[], turns: number): ChatMessage[] {
  const userIdx = messages.map((m, i) => (m.role === "user" ? i : -1)).filter(i => i >= 0);
  if (userIdx.length <= turns) return messages;
  return messages.slice(userIdx[userIdx.length - turns]);
}
