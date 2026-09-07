"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Lexer = void 0;
const token_types_1 = require("./token.types");
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
const PREFIX_MAP = [
    { prefix: "ai:", type: token_types_1.TokenType.AI },
    { prefix: "seo:", type: token_types_1.TokenType.SEO },
    { prefix: "schema:", type: token_types_1.TokenType.SCHEMA },
    { prefix: "image:", type: token_types_1.TokenType.IMAGE },
    { prefix: "#if ", type: token_types_1.TokenType.BLOCK_IF_OPEN },
    { prefix: "#unless ", type: token_types_1.TokenType.BLOCK_UNLESS_OPEN },
    { prefix: "#each ", type: token_types_1.TokenType.BLOCK_EACH_OPEN },
    { prefix: "else", type: token_types_1.TokenType.BLOCK_ELSE },
    { prefix: "/", type: token_types_1.TokenType.BLOCK_CLOSE },
];
class Lexer {
    tokenize(template) {
        const tokens = [];
        let lastIndex = 0;
        let match;
        // Reset regex state — important when reusing the same regex object
        TAG_REGEX.lastIndex = 0;
        while ((match = TAG_REGEX.exec(template)) !== null) {
            const [fullMatch, inner] = match;
            const matchStart = match.index;
            // Emit TEXT token for everything before this tag
            if (matchStart > lastIndex) {
                const text = template.slice(lastIndex, matchStart);
                tokens.push(this.makeToken(token_types_1.TokenType.TEXT, text, text, template, lastIndex));
            }
            const trimmed = inner.trim();
            const token = this.classifyTag(fullMatch, trimmed, template, matchStart);
            tokens.push(token);
            lastIndex = matchStart + fullMatch.length;
        }
        // Emit remaining text after the last tag
        if (lastIndex < template.length) {
            const text = template.slice(lastIndex);
            tokens.push(this.makeToken(token_types_1.TokenType.TEXT, text, text, template, lastIndex));
        }
        tokens.push(this.makeToken(token_types_1.TokenType.EOF, "", "", template, template.length));
        return tokens;
    }
    // ── Private helpers ──────────────────────────────────────────────────────
    classifyTag(raw, inner, source, offset) {
        for (const { prefix, type } of PREFIX_MAP) {
            if (inner.startsWith(prefix)) {
                // Strip the prefix to get the meaningful value
                // e.g. "ai:faq" → "faq", "#if premium" → "premium"
                const value = inner.slice(prefix.length).trim();
                return this.makeToken(type, raw, value, source, offset);
            }
        }
        // No prefix matched → plain variable: {{city}} → value = "city"
        return this.makeToken(token_types_1.TokenType.VARIABLE, raw, inner, source, offset);
    }
    makeToken(type, raw, value, source, offset) {
        // Calculate line and column for error reporting
        const before = source.slice(0, offset);
        const lines = before.split("\n");
        const line = lines.length;
        const col = (lines[lines.length - 1]?.length ?? 0) + 1;
        return { type, raw, value, line, col };
    }
}
exports.Lexer = Lexer;
//# sourceMappingURL=lexer.js.map