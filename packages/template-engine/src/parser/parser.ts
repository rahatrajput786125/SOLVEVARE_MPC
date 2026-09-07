import { Token, TokenType } from "../lexer/token.types";
import {
  AstNode,
  TextNode,
  VariableNode,
  AiNode,
  SeoNode,
  SchemaNode,
  ImageNode,
  IfNode,
  UnlessNode,
  EachNode,
} from "./ast.types";

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

export class TemplateParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public col: number,
    public raw: string
  ) {
    super(`[TemplateParseError] Line ${line}:${col} — ${message} (near: "${raw}")`);
    this.name = "TemplateParseError";
  }
}

export class Parser {
  private tokens: Token[] = [];
  private pos = 0;

  parse(tokens: Token[]): AstNode[] {
    this.tokens = tokens;
    this.pos = 0;
    return this.parseBlock();
  }

  // ── Core parsing loop ────────────────────────────────────────────────────

  // Parses a sequence of nodes until it hits a block-closing token
  // or EOF. Used for the root level AND inside if/each bodies.
  private parseBlock(stopAt?: string): AstNode[] {
    const nodes: AstNode[] = [];

    while (!this.isAtEnd()) {
      const token = this.peek();

      // Stop when we hit the closing tag for the current block
      if (token.type === TokenType.BLOCK_CLOSE) {
        if (!stopAt || token.value === stopAt || token.value === "") break;
      }

      // Stop at {{else}} — caller (parseIf) handles it
      if (token.type === TokenType.BLOCK_ELSE) break;

      if (token.type === TokenType.EOF) break;

      const node = this.parseNode();
      if (node) nodes.push(node);
    }

    return nodes;
  }

  private parseNode(): AstNode | null {
    const token = this.advance();

    switch (token.type) {
      case TokenType.TEXT:
        return this.parseText(token);

      case TokenType.VARIABLE:
        return this.parseVariable(token);

      case TokenType.AI:
        return this.parseAi(token);

      case TokenType.SEO:
        return this.parseSeo(token);

      case TokenType.SCHEMA:
        return this.parseSchema(token);

      case TokenType.IMAGE:
        return this.parseImage(token);

      case TokenType.BLOCK_IF_OPEN:
        return this.parseIf(token);

      case TokenType.BLOCK_UNLESS_OPEN:
        return this.parseUnless(token);

      case TokenType.BLOCK_EACH_OPEN:
        return this.parseEach(token);

      case TokenType.BLOCK_CLOSE:
      case TokenType.BLOCK_ELSE:
      case TokenType.EOF:
        // These are handled by the caller — put the token back
        this.pos--;
        return null;

      default:
        throw new TemplateParseError(
          `Unexpected token type: ${token.type}`,
          token.line,
          token.col,
          token.raw
        );
    }
  }

  // ── Node parsers ─────────────────────────────────────────────────────────

  private parseText(token: Token): TextNode {
    return { kind: "text", value: token.value };
  }

  private parseVariable(token: Token): VariableNode {
    // Syntax: {{variableName|modifier1|modifier2|default:fallback}}
    // Examples:
    //   {{city}}                    → name="city", modifiers=[]
    //   {{city|uppercase}}          → name="city", modifiers=["uppercase"]
    //   {{city|default:New York}}   → name="city", fallback="New York"
    const parts = token.value.split("|");
    const name = parts[0].trim();
    const modifiers: string[] = [];
    let fallback: string | undefined;

    for (let i = 1; i < parts.length; i++) {
      const mod = parts[i].trim();
      if (mod.startsWith("default:")) {
        fallback = mod.slice("default:".length);
      } else {
        modifiers.push(mod);
      }
    }

    if (!name) {
      throw new TemplateParseError(
        "Variable name cannot be empty",
        token.line,
        token.col,
        token.raw
      );
    }

    return { kind: "variable", name, modifiers, fallback };
  }

  private parseAi(token: Token): AiNode {
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

  private parseSeo(token: Token): SeoNode {
    return { kind: "seo", field: token.value };
  }

  private parseSchema(token: Token): SchemaNode {
    return { kind: "schema", schemaType: token.value };
  }

  private parseImage(token: Token): ImageNode {
    // Syntax: {{image:hero}} or {{image:hero alt="{{service}} in {{city}}"}}
    const altMatch = token.value.match(/^(\S+)\s+alt="([^"]+)"$/);
    if (altMatch) {
      return { kind: "image", key: altMatch[1], alt: altMatch[2] };
    }
    return { kind: "image", key: token.value };
  }

  private parseIf(token: Token): IfNode {
    // Condition is the token value: "premium", "city", "plan == starter"
    const condition = token.value;
    if (!condition) {
      throw new TemplateParseError(
        "{{#if}} requires a condition",
        token.line,
        token.col,
        token.raw
      );
    }

    // Parse the consequent (true branch) — stops at {{else}} or {{/if}}
    const consequent = this.parseBlock("if");

    let alternate: AstNode[] = [];

    // Check for {{else}}
    if (this.peek().type === TokenType.BLOCK_ELSE) {
      this.advance(); // consume {{else}}
      alternate = this.parseBlock("if");
    }

    // Consume {{/if}}
    this.expectClose("if", token);

    return { kind: "if", condition, consequent, alternate };
  }

  private parseUnless(token: Token): UnlessNode {
    const condition = token.value;
    if (!condition) {
      throw new TemplateParseError(
        "{{#unless}} requires a condition",
        token.line,
        token.col,
        token.raw
      );
    }

    const body = this.parseBlock("unless");
    this.expectClose("unless", token);

    return { kind: "unless", condition, body };
  }

  private parseEach(token: Token): EachNode {
    const arrayName = token.value;
    if (!arrayName) {
      throw new TemplateParseError(
        "{{#each}} requires an array variable name",
        token.line,
        token.col,
        token.raw
      );
    }

    const body = this.parseBlock("each");
    this.expectClose("each", token);

    return { kind: "each", arrayName, body };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private expectClose(blockName: string, openToken: Token): void {
    const next = this.peek();

    if (
      next.type !== TokenType.BLOCK_CLOSE ||
      (next.value !== blockName && next.value !== "")
    ) {
      throw new TemplateParseError(
        `Unclosed {{#${blockName}}} block — expected {{/${blockName}}}`,
        openToken.line,
        openToken.col,
        openToken.raw
      );
    }

    this.advance(); // consume the closing tag
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: TokenType.EOF, raw: "", value: "", line: 0, col: 0 };
  }

  private advance(): Token {
    const token = this.peek();
    if (token.type !== TokenType.EOF) this.pos++;
    return token;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length || this.peek().type === TokenType.EOF;
  }
}
