"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Parser = exports.TemplateParseError = void 0;
const token_types_1 = require("../lexer/token.types");
// =============================================================================
// PARSER — Recursive Descent
//
// Converts Token[] → AstNode[]
//
// Why recursive descent? Block tags (if/each) are nested structures.
// A recursive parser naturally handles arbitrary nesting depth.
// The call stack mirrors the nesting depth of the template.
//
// Error strategy: throw TemplateParseError with line/col info.
// Never silently swallow errors — a broken template should fail loudly
// at parse time, not produce garbage output at render time.
// =============================================================================
class TemplateParseError extends Error {
    line;
    col;
    raw;
    constructor(message, line, col, raw) {
        super(`[TemplateParseError] Line ${line}:${col} — ${message} (near: "${raw}")`);
        this.line = line;
        this.col = col;
        this.raw = raw;
        this.name = "TemplateParseError";
    }
}
exports.TemplateParseError = TemplateParseError;
class Parser {
    tokens = [];
    pos = 0;
    parse(tokens) {
        this.tokens = tokens;
        this.pos = 0;
        return this.parseBlock();
    }
    // ── Core parsing loop ────────────────────────────────────────────────────
    // Parses a sequence of nodes until it hits a block-closing token
    // or EOF. Used for the root level AND inside if/each bodies.
    parseBlock(stopAt) {
        const nodes = [];
        while (!this.isAtEnd()) {
            const token = this.peek();
            // Stop when we hit the closing tag for the current block
            if (token.type === token_types_1.TokenType.BLOCK_CLOSE) {
                if (!stopAt || token.value === stopAt || token.value === "")
                    break;
            }
            // Stop at {{else}} — caller (parseIf) handles it
            if (token.type === token_types_1.TokenType.BLOCK_ELSE)
                break;
            if (token.type === token_types_1.TokenType.EOF)
                break;
            const node = this.parseNode();
            if (node)
                nodes.push(node);
        }
        return nodes;
    }
    parseNode() {
        const token = this.advance();
        switch (token.type) {
            case token_types_1.TokenType.TEXT:
                return this.parseText(token);
            case token_types_1.TokenType.VARIABLE:
                return this.parseVariable(token);
            case token_types_1.TokenType.AI:
                return this.parseAi(token);
            case token_types_1.TokenType.SEO:
                return this.parseSeo(token);
            case token_types_1.TokenType.SCHEMA:
                return this.parseSchema(token);
            case token_types_1.TokenType.IMAGE:
                return this.parseImage(token);
            case token_types_1.TokenType.BLOCK_IF_OPEN:
                return this.parseIf(token);
            case token_types_1.TokenType.BLOCK_UNLESS_OPEN:
                return this.parseUnless(token);
            case token_types_1.TokenType.BLOCK_EACH_OPEN:
                return this.parseEach(token);
            case token_types_1.TokenType.BLOCK_CLOSE:
            case token_types_1.TokenType.BLOCK_ELSE:
            case token_types_1.TokenType.EOF:
                // These are handled by the caller — put the token back
                this.pos--;
                return null;
            default:
                throw new TemplateParseError(`Unexpected token type: ${token.type}`, token.line, token.col, token.raw);
        }
    }
    // ── Node parsers ─────────────────────────────────────────────────────────
    parseText(token) {
        return { kind: "text", value: token.value };
    }
    parseVariable(token) {
        // Syntax: {{variableName|modifier1|modifier2|default:fallback}}
        // Examples:
        //   {{city}}                    → name="city", modifiers=[]
        //   {{city|uppercase}}          → name="city", modifiers=["uppercase"]
        //   {{city|default:New York}}   → name="city", fallback="New York"
        const parts = token.value.split("|");
        const name = parts[0].trim();
        const modifiers = [];
        let fallback;
        for (let i = 1; i < parts.length; i++) {
            const mod = parts[i].trim();
            if (mod.startsWith("default:")) {
                fallback = mod.slice("default:".length);
            }
            else {
                modifiers.push(mod);
            }
        }
        if (!name) {
            throw new TemplateParseError("Variable name cannot be empty", token.line, token.col, token.raw);
        }
        return { kind: "variable", name, modifiers, fallback };
    }
    parseAi(token) {
        // Syntax: {{ai:placeholder}} or {{ai:placeholder prompt="custom prompt"}}
        const promptMatch = token.value.match(/^(\S+)\s+prompt="([^"]+)"$/);
        if (promptMatch) {
            return {
                kind: "ai",
                placeholder: promptMatch[1],
                promptOverride: promptMatch[2],
            };
        }
        return { kind: "ai", placeholder: token.value };
    }
    parseSeo(token) {
        return { kind: "seo", field: token.value };
    }
    parseSchema(token) {
        return { kind: "schema", schemaType: token.value };
    }
    parseImage(token) {
        // Syntax: {{image:hero}} or {{image:hero alt="{{service}} in {{city}}"}}
        const altMatch = token.value.match(/^(\S+)\s+alt="([^"]+)"$/);
        if (altMatch) {
            return { kind: "image", key: altMatch[1], alt: altMatch[2] };
        }
        return { kind: "image", key: token.value };
    }
    parseIf(token) {
        // Condition is the token value: "premium", "city", "plan == starter"
        const condition = token.value;
        if (!condition) {
            throw new TemplateParseError("{{#if}} requires a condition", token.line, token.col, token.raw);
        }
        // Parse the consequent (true branch) — stops at {{else}} or {{/if}}
        const consequent = this.parseBlock("if");
        let alternate = [];
        // Check for {{else}}
        if (this.peek().type === token_types_1.TokenType.BLOCK_ELSE) {
            this.advance(); // consume {{else}}
            alternate = this.parseBlock("if");
        }
        // Consume {{/if}}
        this.expectClose("if", token);
        return { kind: "if", condition, consequent, alternate };
    }
    parseUnless(token) {
        const condition = token.value;
        if (!condition) {
            throw new TemplateParseError("{{#unless}} requires a condition", token.line, token.col, token.raw);
        }
        const body = this.parseBlock("unless");
        this.expectClose("unless", token);
        return { kind: "unless", condition, body };
    }
    parseEach(token) {
        const arrayName = token.value;
        if (!arrayName) {
            throw new TemplateParseError("{{#each}} requires an array variable name", token.line, token.col, token.raw);
        }
        const body = this.parseBlock("each");
        this.expectClose("each", token);
        return { kind: "each", arrayName, body };
    }
    // ── Helpers ──────────────────────────────────────────────────────────────
    expectClose(blockName, openToken) {
        const next = this.peek();
        if (next.type !== token_types_1.TokenType.BLOCK_CLOSE ||
            (next.value !== blockName && next.value !== "")) {
            throw new TemplateParseError(`Unclosed {{#${blockName}}} block — expected {{/${blockName}}}`, openToken.line, openToken.col, openToken.raw);
        }
        this.advance(); // consume the closing tag
    }
    peek() {
        return this.tokens[this.pos] ?? { type: token_types_1.TokenType.EOF, raw: "", value: "", line: 0, col: 0 };
    }
    advance() {
        const token = this.peek();
        if (token.type !== token_types_1.TokenType.EOF)
            this.pos++;
        return token;
    }
    isAtEnd() {
        return this.pos >= this.tokens.length || this.peek().type === token_types_1.TokenType.EOF;
    }
}
exports.Parser = Parser;
//# sourceMappingURL=parser.js.map