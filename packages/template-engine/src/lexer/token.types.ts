// =============================================================================
// TOKEN TYPES
// The lexer scans raw template text and emits a flat stream of tokens.
// The parser consumes that stream and builds a tree (AST).
//
// Flat token list keeps the lexer simple — structural complexity
// belongs in the parser, not the scanner.
// =============================================================================

export enum TokenType {
  TEXT = "TEXT",                           // plain text between tags
  VARIABLE = "VARIABLE",                   // {{city}}
  AI = "AI",                               // {{ai:faq}}
  SEO = "SEO",                             // {{seo:title}}
  SCHEMA = "SCHEMA",                       // {{schema:LocalBusiness}}
  IMAGE = "IMAGE",                         // {{image:hero}}
  BLOCK_IF_OPEN = "BLOCK_IF_OPEN",         // {{#if condition}}
  BLOCK_UNLESS_OPEN = "BLOCK_UNLESS_OPEN", // {{#unless condition}}
  BLOCK_EACH_OPEN = "BLOCK_EACH_OPEN",     // {{#each items}}
  BLOCK_ELSE = "BLOCK_ELSE",               // {{else}}
  BLOCK_CLOSE = "BLOCK_CLOSE",             // {{/if}} {{/each}}
  EOF = "EOF",
}

export interface Token {
  type: TokenType;
  raw: string;    // original matched string — used in error messages
  value: string;  // extracted name/expression
  line: number;
  col: number;
}
