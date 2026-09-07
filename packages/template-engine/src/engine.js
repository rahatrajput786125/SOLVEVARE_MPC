"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateParseError = exports.TemplateEngine = void 0;
const lexer_1 = require("./lexer/lexer");
const parser_1 = require("./parser/parser");
Object.defineProperty(exports, "TemplateParseError", { enumerable: true, get: function () { return parser_1.TemplateParseError; } });
const validator_1 = require("./validator/validator");
const renderer_1 = require("./renderer/renderer");
const seo_field_generator_1 = require("./renderer/seo-field-generator");
class TemplateEngine {
    lexer = new lexer_1.Lexer();
    parser = new parser_1.Parser();
    validator = new validator_1.Validator();
    renderer = new renderer_1.Renderer();
    seoGenerator = new seo_field_generator_1.SeoFieldGenerator();
    // Cache parsed ASTs — parsing is CPU-bound and the same template
    // is rendered thousands of times. Cache by template content hash.
    astCache = new Map();
    // ── Public API ───────────────────────────────────────────────────────────
    // Validate a template at save time.
    // Pass knownVariables from TemplateVariable records for strict checking.
    // Pass null for lenient validation (preview mode).
    validate(content, knownVariables = null) {
        try {
            const ast = this.parseWithCache(content);
            return this.validator.validate(ast, knownVariables);
        }
        catch (err) {
            if (err instanceof parser_1.TemplateParseError) {
                return {
                    valid: false,
                    errors: [{ message: err.message, path: `line:${err.line}` }],
                    requiredVariables: new Set(),
                    aiPlaceholders: new Set(),
                };
            }
            throw err;
        }
    }
    // Render a full page — returns HTML + SEO fields.
    // context.aiContent must be pre-populated by the AI resolver.
    render(template, context, baseUrl) {
        const ast = this.parseWithCache(template.content);
        const { html, missingVariables, unresolvedAi } = this.renderer.render(ast, context);
        const seo = this.seoGenerator.generate({
            titleTemplate: template.titleTemplate,
            descriptionTemplate: template.descriptionTemplate,
            slugTemplate: template.slugTemplate,
        }, context.data, baseUrl);
        return { html, seo, missingVariables, unresolvedAi };
    }
    // Resolve just the SEO fields — used by the sitemap generator
    // without rendering the full page body.
    resolveSeoFields(template, data, baseUrl) {
        return this.seoGenerator.generate(template, data, baseUrl);
    }
    // Extract all variable names and AI placeholders from a template.
    // Used to auto-populate TemplateVariable records on template save.
    extractMetadata(content) {
        const result = this.validate(content, null);
        return {
            variables: Array.from(result.requiredVariables),
            aiPlaceholders: Array.from(result.aiPlaceholders),
        };
    }
    // ── Private helpers ──────────────────────────────────────────────────────
    parseWithCache(content) {
        // Use content as cache key — same template string = same AST
        // In production, use a hash (SHA-256) as the key to save memory
        const cached = this.astCache.get(content);
        if (cached)
            return cached;
        const tokens = this.lexer.tokenize(content);
        const ast = this.parser.parse(tokens);
        // Cap cache size to prevent memory leaks in long-running workers
        if (this.astCache.size >= 500) {
            // Evict oldest entry (Map preserves insertion order)
            const firstKey = this.astCache.keys().next().value;
            if (firstKey !== undefined)
                this.astCache.delete(firstKey);
        }
        this.astCache.set(content, ast);
        return ast;
    }
}
exports.TemplateEngine = TemplateEngine;
//# sourceMappingURL=engine.js.map