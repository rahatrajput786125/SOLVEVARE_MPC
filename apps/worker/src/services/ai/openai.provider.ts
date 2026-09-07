import { Logger } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";
import {
  AiProvider,
  AiCompletionRequest,
  AiCompletionResponse,
  calculateCost,
} from "./ai-provider.interface";

// =============================================================================
// OPENAI PROVIDER
//
// Uses axios directly instead of the openai npm package.
// Why? The openai package adds 2MB to the bundle and we only use
// one endpoint (chat completions). Axios gives us full control
// over timeouts, retries, and error handling.
//
// Retry strategy:
//   - 429 (rate limit): exponential backoff, up to 5 retries
//   - 500/503 (server error): retry up to 3 times
//   - 400 (bad request): don't retry — prompt is malformed
//   - Timeout (30s): retry up to 2 times
// =============================================================================

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 5;

interface OpenAiMessage {
  role: string;
  content: string;
}

interface OpenAiResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

export class OpenAiProvider implements AiProvider {
  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.http = axios.create({
      baseURL: OPENAI_API_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const payload = {
      model: request.model,
      messages: request.messages as OpenAiMessage[],
      max_tokens: request.maxTokens ?? 1000,
      temperature: request.temperature ?? 0.7,
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.http.post<OpenAiResponse>("", payload);
        const data = response.data;

        const content = data.choices[0]?.message?.content ?? "";
        const usage = data.usage;

        return {
          content: content.trim(),
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          costUsd: calculateCost(request.model, usage.prompt_tokens, usage.completion_tokens),
          model: data.model,
        };
      } catch (err) {
        lastError = err as Error;

        if (axios.isAxiosError(err)) {
          const status = err.response?.status;

          // Don't retry on bad request — the prompt itself is the problem
          if (status === 400 || status === 401) {
            throw new Error(
              `OpenAI API error ${status}: ${JSON.stringify(err.response?.data)}`
            );
          }

          // Rate limited — wait longer before retrying
          if (status === 429) {
            const retryAfter = parseInt(
              err.response?.headers["retry-after"] ?? "60",
              10
            );
            const waitMs = Math.min(retryAfter * 1000, 60_000);
            this.logger.warn(
              `OpenAI rate limited. Waiting ${waitMs}ms before retry ${attempt}/${MAX_RETRIES}`
            );
            await this.sleep(waitMs);
            continue;
          }

          // Server error — exponential backoff
          if (status && status >= 500) {
            const waitMs = Math.pow(2, attempt) * 1000;
            this.logger.warn(
              `OpenAI server error ${status}. Retrying in ${waitMs}ms (${attempt}/${MAX_RETRIES})`
            );
            await this.sleep(waitMs);
            continue;
          }
        }

        // Timeout or network error — exponential backoff
        const waitMs = Math.pow(2, attempt) * 1000;
        this.logger.warn(
          `OpenAI request failed: ${lastError.message}. Retrying in ${waitMs}ms (${attempt}/${MAX_RETRIES})`
        );
        await this.sleep(waitMs);
      }
    }

    throw new Error(
      `OpenAI request failed after ${MAX_RETRIES} attempts: ${lastError?.message}`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
