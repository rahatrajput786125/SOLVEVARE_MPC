"use strict";
// =============================================================================
// AST NODE TYPES
// The parser converts the flat token stream into a tree.
// Each node type maps to a rendering strategy.
//
// Why a discriminated union? TypeScript narrows the type in switch/case,
// so the renderer gets full type safety when handling each node kind.
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=ast.types.js.map