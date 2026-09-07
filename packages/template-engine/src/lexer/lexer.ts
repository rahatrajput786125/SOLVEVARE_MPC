import { Token, TokenType } from "./token.types";

// =============================================================================
// LEXER
// Converts raw template string → flat Token[]
//
// Strategy: single-pass regex scan.
// We find the next {{ tag, emit everything before it as TEXT,
// then classify the tag content into the correct TokenType.
//
// Why regex over char-by-char? Template tags are well-defined patterns.
// Regex is faster and the pattern is simple enough to be readable.
// =============================================================================

// Matches any {{ ... }} expression, capturing the inner content.
// Non-greedy .*? prevents matching across multiple tags on the same line.
const TAG_REGEX = /\{\{(.*?)\}\}/g;

// Prefix patterns that determine token type
const PREFIX_MAP: Array<{ prefix: string; type: TokenType }> = [
  { prefix: "ai:",     type: TokenType.AI },
  { prefix: "seo:",    type: TokenType.SEO },
  { prefix: "schema:", type: TokenType.SCHEMA },
  { prefix: "image:",  type: TokenType.IMAGE },
  { prefix: "#if ",    type: TokenType.BLOCK_IF_OPEN },
  { prefix: "#unless ", type: TokenType.BLOCK_UNLESS_OPEN },
  { prefix: "#each ",  type: TokenType.BLOCK_EACH_OPEN },
  { prefix: "else",    type: TokenType.BLOCK_ELSE },
  { prefix: "/",       type: TokenType.BLOCK_CLOSE },
];

export class Lexer {
  tokenize(template: string): Token[] {
    const tokens: Token[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    // Reset regex state — important when reusing the same regex object
    TAG_REGEX.lastIndex = 0;

    while ((match = TAG_REGEX.exec(template)) !== null) {
      const [fullMatch, inner] = match;
      const matchStart = match.index;

      // Emit TEXT token for everything before this tag
      if (matchStart > lastIndex) {
        const text = template.slice(lastIndex, matchStart);
        tokens.push(this.makeToken(TokenType.TEXT, text, text, template, lastIndex));
      }

      const trimmed = inner.trim();
      const token = this.classifyTag(fullMatch, trimmed, template, matchStart);
      tokens.push(token);

      lastIndex = matchStart + fullMatch.length;
    }

    // Emit remaining text after the last tag
    if (lastIndex < template.length) {
      const text = template.slice(lastIndex);
      tokens.push(this.makeToken(TokenType.TEXT, text, text, template, lastIndex));
    }

    tokens.push(this.makeToken(TokenType.EOF, "", "", template, template.length));
    return tokens;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private classifyTag(
    raw: string,
    inner: string,
    source: string,
    offset: number
  ): Token {
    for (const { prefix, type } of PREFIX_MAP) {
      if (inner.startsWith(prefix)) {
        // Strip the prefix to get the meaningful value
        // e.g. "ai:faq" → "faq", "#if premium" → "premium"
        const value = inner.slice(prefix.length).trim();
        return this.makeToken(type, raw, value, source, offset);
      }
    }

    // No prefix matched → plain variable: {{city}} → value = "city"
    return this.makeToken(TokenType.VARIABLE, raw, inner, source, offset);
  }

  private makeToken(
    type: TokenType,
    raw: string,
    value: string,
    source: string,
    offset: number
  ): Token {
    // Calculate line and column for error reporting
    const before = source.slice(0, offset);
    const lines = before.split("\n");
    const line = lines.length;
    const col = (lines[lines.length - 1]?.length ?? 0) + 1;
    return { type, raw, value, line, col };
  }
}
