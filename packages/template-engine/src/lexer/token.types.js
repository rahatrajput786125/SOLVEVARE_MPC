"use strict";
// =============================================================================
// TOKEN TYPES
// The lexer scans raw template text and emits a flat stream of tokens.
// The parser consumes that stream and builds a tree (AST).
//
// Flat token list keeps the lexer simple — structural complexity
// belongs in the parser, not the scanner.
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenType = void 0;
var TokenType;
(function (TokenType) {
    TokenType["TEXT"] = "TEXT";
    TokenType["VARIABLE"] = "VARIABLE";
    TokenType["AI"] = "AI";
    TokenType["SEO"] = "SEO";
    TokenType["SCHEMA"] = "SCHEMA";
    TokenType["IMAGE"] = "IMAGE";
    TokenType["BLOCK_IF_OPEN"] = "BLOCK_IF_OPEN";
    TokenType["BLOCK_UNLESS_OPEN"] = "BLOCK_UNLESS_OPEN";
    TokenType["BLOCK_EACH_OPEN"] = "BLOCK_EACH_OPEN";
    TokenType["BLOCK_ELSE"] = "BLOCK_ELSE";
    TokenType["BLOCK_CLOSE"] = "BLOCK_CLOSE";
    TokenType["EOF"] = "EOF";
})(TokenType || (exports.TokenType = TokenType = {}));
//# sourceMappingURL=token.types.js.map