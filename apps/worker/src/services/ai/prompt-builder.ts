import { AiMessage } from "./ai-provider.interface";

// =============================================================================
// PROMPT ENGINEERING SYSTEM
//
// Why structured prompts matter:
// "Write about plumbers in Austin" → generic, thin, low-quality
// A well-engineered prompt with system context, constraints, and
// output format instructions → unique, specific, rankable content.
//
// Prompt structure:
//   1. System message: persona + quality constraints
//   2. User message: specific task with context variables
//   3. Format instructions: exact output format expected
//
// Anti-spam measures built into every prompt:
//   - "Do not use generic filler phrases"
//   - "Include specific local details"
//   - "Vary sentence structure"
//   - "Do not repeat the keyword more than 3 times"
//
// These constraints are what separate rankable content from AI spam.
// =============================================================================

export interface PromptContext {
  placeholder: string;
  data: Record<string, string>;
  promptOverride?: string;
  // Quality tier affects prompt strictness and token budget
  qualityTier?: "fast" | "standard" | "premium";
}

export interface BuiltPrompt {
  messages: AiMessage[];
  maxTokens: number;
  temperature: number;
  expectedMinLength: number; // for quality scoring
}

// System persona — used for all content generation
const SYSTEM_PERSONA = `You are an expert SEO content writer specializing in local service businesses. 
Your content is:
- Factually accurate and locally relevant
- Written for humans first, search engines second
- Free of generic filler phrases like "look no further" or "best in class"
- Varied in sentence structure and vocabulary
- Specific to the location and service mentioned
- Never repetitive or padded to hit a word count

Always follow the exact output format requested. Do not add preamble or commentary.`;

// Prompt templates per placeholder type
const PROMPT_TEMPLATES: Record<
  string,
  (ctx: PromptContext) => { userMessage: string; maxTokens: number; minLength: number; temperature: number }
> = {
  faq: (ctx) => {
    const { city, service, state } = extractCommonVars(ctx.data);
    return {
      userMessage: `Write exactly 5 frequently asked questions and answers about ${service} services in ${city}${state ? `, ${state}` : ""}.

Requirements:
- Each question must be something a real customer would ask
- Each answer must be 2-4 sentences, specific to ${city}
- Include at least one question about pricing, one about timing, one about qualifications
- Do not repeat the same information across answers
- Do not use phrases like "great question" or "absolutely"

Output format (follow exactly):
Q: [question]
A: [answer]

Q: [question]
A: [answer]

(repeat for all 5 questions)`,
      maxTokens: 800,
      minLength: 400,
      temperature: 0.7,
    };
  },

  intro: (ctx) => {
    const { city, service, state } = extractCommonVars(ctx.data);
    return {
      userMessage: `Write a 150-200 word introduction paragraph for a page about ${service} services in ${city}${state ? `, ${state}` : ""}.

Requirements:
- Open with a specific fact or scenario relevant to ${city} residents
- Mention the service naturally 2-3 times (not more)
- Include one specific local detail (neighborhood, landmark, or local context)
- End with a clear value proposition
- Do NOT start with "Are you looking for" or "If you need"
- Do NOT use the word "professional" more than once

Output: A single paragraph of 150-200 words. No headers, no lists.`,
      maxTokens: 300,
      minLength: 150,
      temperature: 0.75,
    };
  },

  conclusion: (ctx) => {
    const { city, service, brand } = extractCommonVars(ctx.data);
    return {
      userMessage: `Write a 100-150 word conclusion paragraph for a ${service} services page targeting ${city} residents.

Requirements:
- Summarize the key benefit of choosing a local ${service} provider
- Include a soft call-to-action (not aggressive sales language)
- Mention ${brand || "a trusted local provider"} naturally if it fits
- Do not repeat information from the introduction
- End with a forward-looking statement

Output: A single paragraph. No headers.`,
      maxTokens: 250,
      minLength: 100,
      temperature: 0.7,
    };
  },

  benefits: (ctx) => {
    const { city, service } = extractCommonVars(ctx.data);
    return {
      userMessage: `List exactly 5 benefits of hiring a professional ${service} in ${city}.

Requirements:
- Each benefit must be specific and actionable, not generic
- At least 2 benefits must reference local context (${city} climate, regulations, or lifestyle)
- Each benefit explanation must be 1-2 sentences
- Vary the opening word of each benefit

Output format:
**[Benefit Title]**: [1-2 sentence explanation]

(repeat for all 5 benefits)`,
      maxTokens: 500,
      minLength: 250,
      temperature: 0.65,
    };
  },

  local_content: (ctx) => {
    const { city, service, state } = extractCommonVars(ctx.data);
    return {
      userMessage: `Write 2 paragraphs (150 words each) about the ${service} industry specifically in ${city}${state ? `, ${state}` : ""}.

Paragraph 1: Describe the local market — demand drivers, seasonal factors, typical pricing range for ${city}, and what makes ${city} unique for ${service} services.

Paragraph 2: Describe what ${city} residents should look for when hiring a ${service} provider — local licensing requirements, common issues specific to ${city} homes/businesses, and questions to ask.

Requirements:
- Include at least 3 specific local details (not generic)
- Mention ${city} naturally in each paragraph
- Do not use statistics you cannot verify
- Write in second person ("you", "your") for the second paragraph

Output: Two paragraphs separated by a blank line.`,
      maxTokens: 600,
      minLength: 250,
      temperature: 0.7,
    };
  },

  meta_description: (ctx) => {
    const { city, service } = extractCommonVars(ctx.data);
    return {
      userMessage: `Write a meta description for a page about ${service} services in ${city}.

Requirements:
- Exactly 140-155 characters (count carefully)
- Include "${service}" and "${city}" naturally
- Include a value proposition or differentiator
- End with a soft call to action
- Do NOT start with "Looking for" or "Find the best"

Output: The meta description text only. No quotes, no labels.`,
      maxTokens: 80,
      minLength: 140,
      temperature: 0.6,
    };
  },

  title_variations: (ctx) => {
    const { city, service } = extractCommonVars(ctx.data);
    return {
      userMessage: `Generate 5 SEO title tag variations for a page about ${service} services in ${city}.

Requirements:
- Each title must be 50-60 characters
- Each must include "${service}" and "${city}"
- Vary the structure (don't just change one word)
- Include at least one with a number, one with a question, one with a benefit

Output format (one per line, no numbering):
[title 1]
[title 2]
[title 3]
[title 4]
[title 5]`,
      maxTokens: 200,
      minLength: 100,
      temperature: 0.8,
    };
  },
};

export class PromptBuilder {
  build(ctx: PromptContext): BuiltPrompt {
    // Use override prompt if provided (from {{ai:faq prompt="custom"}})
    if (ctx.promptOverride) {
      return this.buildFromOverride(ctx);
    }

    const template = PROMPT_TEMPLATES[ctx.placeholder];
    if (!template) {
      return this.buildGenericPrompt(ctx);
    }

    const { userMessage, maxTokens, minLength, temperature } = template(ctx);

    // Premium tier: use stronger model, higher token budget
    const tokenMultiplier = ctx.qualityTier === "premium" ? 1.5 : 1;

    return {
      messages: [
        { role: "system", content: SYSTEM_PERSONA },
        { role: "user", content: userMessage },
      ],
      maxTokens: Math.round(maxTokens * tokenMultiplier),
      temperature,
      expectedMinLength: minLength,
    };
  }

  // Build a prompt from a user-defined override string
  // Resolves {{variable}} placeholders in the override
  private buildFromOverride(ctx: PromptContext): BuiltPrompt {
    const resolved = ctx.promptOverride!.replace(
      /\{\{(\w+)\}\}/g,
      (_, name: string) => ctx.data[name] ?? ""
    );

    return {
      messages: [
        { role: "system", content: SYSTEM_PERSONA },
        { role: "user", content: resolved },
      ],
      maxTokens: 800,
      temperature: 0.7,
      expectedMinLength: 100,
    };
  }

  private buildGenericPrompt(ctx: PromptContext): BuiltPrompt {
    const { city, service } = extractCommonVars(ctx.data);
    return {
      messages: [
        { role: "system", content: SYSTEM_PERSONA },
        {
          role: "user",
          content: `Write helpful, SEO-optimized content about ${service} in ${city} for the section: "${ctx.placeholder}". 
Keep it under 200 words. Be specific, avoid generic filler, and write naturally.`,
        },
      ],
      maxTokens: 400,
      temperature: 0.7,
      expectedMinLength: 80,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractCommonVars(data: Record<string, string>) {
  return {
    city: data.city ?? data.location ?? data.area ?? "your area",
    service: data.service ?? data.service_type ?? data.category ?? "this service",
    state: data.state ?? data.region ?? "",
    brand: data.brand ?? data.business_name ?? "",
    phone: data.phone ?? "",
  };
}
