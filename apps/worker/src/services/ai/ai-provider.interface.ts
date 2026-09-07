// =============================================================================
// AI PROVIDER ABSTRACTION
//
// Why an interface? We support OpenAI, Anthropic, and Gemini.
// The processor doesn't care which provider is used — it calls complete().
// Swapping providers is a config change, not a code change.
//
// Each provider implementation handles:
//   - API client initialization
//   - Request formatting (each API has different shapes)
//   - Response parsing
//   - Token counting
//   - Cost calculation
// =============================================================================

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionRequest {
  messages: AiMessage[];
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiCompletionResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  model: string;
}

export interface AiProvider {
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
  isAvailable(): boolean;
}

// ── Cost tables (USD per 1K tokens) ─────────────────────────────────────────
// Updated as of mid-2024 — update when pricing changes

export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4o":           { input: 0.005,    output: 0.015 },
  "gpt-4o-mini":      { input: 0.00015,  output: 0.0006 },
  "gpt-4-turbo":      { input: 0.01,     output: 0.03 },
  "gpt-3.5-turbo":    { input: 0.0005,   output: 0.0015 },
  // Anthropic
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  "claude-3-haiku-20240307":    { input: 0.00025, output: 0.00125 },
  // Gemini
  "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
  "gemini-1.5-pro":   { input: 0.00125,  output: 0.005 },
};

export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const costs = MODEL_COSTS[model] ?? { input: 0.001, output: 0.002 };
  return (
    (promptTokens / 1000) * costs.input +
    (completionTokens / 1000) * costs.output
  );
}
