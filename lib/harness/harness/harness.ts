// The harness agent loop: one rulebook + one tool set, driven by any ModelProvider.
// Flow per turn: screen input → load session → [model → run tools]* → guardrails → save session.

import { randomUUID } from "node:crypto";
import { estimateCostUsd } from "../providers/pricing";
import { ToolRegistry } from "../tools/tool-registry";
import { reviewReply, screenUserInput } from "./guardrails";
import { InMemorySessionStore, trimHistory, type SessionStore } from "./session-store";
import { buildSystemPrompt, type SystemPromptOptions } from "./system-prompt";
import type { ChatMessage, HarnessTurnResult, ModelProvider, TokenUsage } from "./types";

export interface HarnessOptions {
  tools?: ToolRegistry;
  sessions?: SessionStore;
  prompt?: SystemPromptOptions;
  maxToolSteps?: number;
  maxOutputTokens?: number;
  /** Stops the loop once this turn's estimated spend passes the cap (protects against runaway loops). */
  maxCostPerTurnUsd?: number;
  historyTurns?: number;
  usdToPhp?: number;
  /** Replaces the default rulebook (Research and Agent harnesses bring their own). */
  system?: string;
  /** Wall-clock budget for the turn; when it runs out the model must answer with what it has. */
  deadlineMs?: number;
  /** Called once per tool result (progress, ledgers). */
  onTool?: (name: string, args: Record<string, unknown>, result: unknown) => void;
}

export class RealEstateHarness {
  readonly tools: ToolRegistry;
  private readonly sessions: SessionStore;
  private readonly system: string;
  private readonly opts: Required<Pick<HarnessOptions, "maxToolSteps" | "maxOutputTokens" | "maxCostPerTurnUsd" | "historyTurns" | "usdToPhp">> & Pick<HarnessOptions, "deadlineMs" | "onTool">;

  constructor(options: HarnessOptions = {}) {
    this.tools = options.tools ?? new ToolRegistry();
    this.sessions = options.sessions ?? new InMemorySessionStore();
    this.system = options.system ?? buildSystemPrompt(options.prompt);
    this.opts = {
      maxToolSteps: options.maxToolSteps ?? 8,
      maxOutputTokens: options.maxOutputTokens ?? 1500,
      maxCostPerTurnUsd: options.maxCostPerTurnUsd ?? 0.25,
      historyTurns: options.historyTurns ?? 12,
      usdToPhp: options.usdToPhp ?? 63.5,
      deadlineMs: options.deadlineMs,
      onTool: options.onTool,
    };
  }

  get systemPrompt(): string {
    return this.system;
  }

  /**
   * Runs one user turn against the given provider.
   * Side effects: reads and writes the session history in the SessionStore.
   */
  async chat(provider: ModelProvider, userMessage: string, sessionId: string = randomUUID()): Promise<HarnessTurnResult> {
    const warnings = screenUserInput(userMessage);
    const history = trimHistory(await this.sessions.get(sessionId), this.opts.historyTurns);
    const messages: ChatMessage[] = [...history, { role: "user", content: userMessage }];
    const usage: TokenUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
    const toolTrace: HarnessTurnResult["toolTrace"] = [];
    let reply = "";
    let steps = 0;
    // Provider-reported cost (OpenRouter) when every call reported one; otherwise the price table estimate.
    let reportedUsd = 0;
    let allReported = true;
    const spentUsd = () => (allReported && steps > 0 ? reportedUsd : estimateCostUsd(provider.model, usage));

    const started = Date.now();
    const timeLeft = () => (this.opts.deadlineMs ? this.opts.deadlineMs - (Date.now() - started) : Infinity);
    const account = (res: Awaited<ReturnType<ModelProvider["complete"]>>) => {
      usage.inputTokens += res.usage.inputTokens;
      usage.cachedInputTokens += res.usage.cachedInputTokens;
      usage.outputTokens += res.usage.outputTokens;
      if (res.costUsd === undefined) allReported = false;
      else reportedUsd += res.costUsd;
    };
    let unfinished = false;

    while (steps < this.opts.maxToolSteps) {
      steps++;
      const res = await provider.complete({ system: this.system, messages, tools: this.tools.definitions(), maxOutputTokens: this.opts.maxOutputTokens });
      account(res);
      messages.push({ role: "assistant", content: res.text, toolCalls: res.toolCalls.length ? res.toolCalls : undefined });
      reply = res.text;
      if (!res.toolCalls.length) break;

      // Independent tool calls of one step run together (web reads take seconds each).
      const results = await Promise.all(res.toolCalls.map((call) => this.tools.execute(call.name, call.arguments)));
      res.toolCalls.forEach((call, i) => {
        const { result } = results[i]!;
        toolTrace.push({ name: call.name, arguments: call.arguments, result });
        this.opts.onTool?.(call.name, call.arguments, result);
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: JSON.stringify(result) });
      });

      const spent = spentUsd();
      if (spent !== null && spent > this.opts.maxCostPerTurnUsd) {
        warnings.push(`Stopped early: this turn reached the US$${this.opts.maxCostPerTurnUsd} spending cap.`);
        unfinished = true;
        break;
      }
      if (steps === this.opts.maxToolSteps) {
        warnings.push("Stopped early: maximum tool steps reached.");
        unfinished = true;
      } else if (timeLeft() < 12_000) {
        warnings.push("Answered with the sources found so far (time limit).");
        unfinished = true;
        break;
      }
    }

    // Out of steps, time or budget with tool results unread: one last call without tools, so the user
    // gets an answer from what was found instead of nothing.
    if (unfinished && messages[messages.length - 1]?.role === "tool" && (this.opts.deadlineMs ? timeLeft() > 4000 : true)) {
      const res = await provider.complete({
        system: `${this.system}\n\nYou cannot call tools now. Answer the user's question with what the tools returned so far, cite sources as before, and say briefly what is still unverified.`,
        messages,
        tools: this.tools.definitions(),
        toolChoice: "none",
        maxOutputTokens: this.opts.maxOutputTokens,
      });
      account(res);
      steps++;
      reply = res.text;
      messages.push({ role: "assistant", content: res.text });
    }
    if (!reply) reply = unfinished ? "I couldn't finish within the limits for one answer. Please try a narrower question." : reply;

    // Close the history on an assistant message so the next turn starts cleanly.
    const last = messages[messages.length - 1];
    if (last?.role === "tool") messages.push({ role: "assistant", content: reply });

    warnings.push(...reviewReply(reply, toolTrace));
    await this.sessions.save(sessionId, messages);
    const raw = spentUsd();
    const usd = raw === null ? null : Math.round(raw * 1e6) / 1e6;
    return {
      sessionId,
      reply,
      provider: provider.id,
      model: provider.model,
      toolTrace,
      usage,
      estimatedCostUsd: usd,
      estimatedCostPhp: usd === null ? null : Math.round(usd * this.opts.usdToPhp * 100) / 100,
      steps,
      warnings,
    };
  }

  /** Runs a calculator or lookup directly, without the AI (zero token cost). */
  runTool(name: string, args: Record<string, unknown>) {
    return this.tools.execute(name, args);
  }

  resetSession(sessionId: string): Promise<void> {
    return this.sessions.clear(sessionId);
  }
}
