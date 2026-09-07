"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Renderer = void 0;
const context_1 = require("../resolver/context");
const sanitizer_1 = require("../sanitizer/sanitizer");
class Renderer {
    sanitizer = new sanitizer_1.Sanitizer();
    render(ast, context) {
        const missingVariables = [];
        const unresolvedAi = [];
        const html = this.renderNodes(ast, context, missingVariables, unresolvedAi);
        return { html, missingVariables, unresolvedAi };
    }
    // ── Core render loop ─────────────────────────────────────────────────────
    renderNodes(nodes, context, missing, unresolved) {
        return nodes
            .map((node) => this.renderNode(node, context, missing, unresolved))
            .join("");
    }
    renderNode(node, context, missing, unresolved) {
        switch (node.kind) {
            case "text":
                // Text nodes are trusted template content — return raw to preserve CSS/styles
                return node.value;
            case "variable":
                return this.renderVariable(node, context, missing);
            case "ai":
                return this.renderAi(node, context, unresolved);
            case "seo":
                return this.renderSeo(node, context);
            case "schema":
                return this.renderSchema(node, context);
            case "image":
                return this.renderImage(node, context);
            case "if":
                return this.renderIf(node, context, missing, unresolved);
            case "unless":
                return this.renderUnless(node, context, missing, unresolved);
            case "each":
                return this.renderEach(node, context, missing, unresolved);
        }
    }
    // ── Node renderers ───────────────────────────────────────────────────────
    renderVariable(node, context, missing) {
        // Resolution order: data row → project settings → fallback → empty string
        let value = context.data[node.name] ??
            context.projectSettings?.[node.name] ??
            node.fallback;
        if (value === undefined || value === null) {
            missing.push(node.name);
            value = "";
        }
        // Sanitize CSV data before injection — prevents XSS via data row
        const sanitized = this.sanitizer.sanitizeText(String(value));
        // Apply modifier pipeline
        return (0, context_1.applyModifiers)(sanitized, node.modifiers);
    }
    renderAi(node, context, unresolved) {
        const content = context.aiContent[node.placeholder];
        if (!content) {
            unresolved.push(node.placeholder);
            return ""; // Render empty — worker will retry AI resolution
        }
        // AI content is HTML — sanitize as HTML (allows formatting tags)
        return this.sanitizer.sanitizeHtml(content);
    }
    renderSeo(node, context) {
        const seo = context.seo;
        const value = seo[node.field] ?? "";
        return this.sanitizer.sanitizeText(value);
    }
    renderSchema(node, context) {
        const schema = context.schema.schemas[node.schemaType];
        if (!schema)
            return "";
        // Emit as a JSON-LD script tag — safe because we control the schema object
        return `<script type="application/ld+json">${JSON.stringify(schema, null, 2)}</script>`;
    }
    renderImage(node, context) {
        const src = context.images.images[node.key];
        if (!src)
            return "";
        const safeSrc = this.sanitizer.sanitizeUrl(src);
        const safeAlt = node.alt
            ? this.sanitizer.sanitizeText(node.alt)
            : "";
        return `<img src="${safeSrc}" alt="${safeAlt}" loading="lazy" />`;
    }
    renderIf(node, context, missing, unresolved) {
        const result = (0, context_1.evaluateCondition)(node.condition, context);
        const branch = result ? node.consequent : node.alternate;
        return this.renderNodes(branch, context, missing, unresolved);
    }
    renderUnless(node, context, missing, unresolved) {
        const result = (0, context_1.evaluateCondition)(node.condition, context);
        if (result)
            return ""; // condition is true → skip the block
        return this.renderNodes(node.body, context, missing, unresolved);
    }
    renderEach(node, context, missing, unresolved) {
        // Array values in CSV are stored as JSON strings: '["item1","item2"]'
        // or pipe-separated: "item1|item2"
        const rawValue = context.data[node.arrayName] ?? "";
        let items = [];
        try {
            const parsed = JSON.parse(rawValue);
            items = Array.isArray(parsed) ? parsed : [String(parsed)];
        }
        catch {
            // Fall back to pipe-separated values
            items = rawValue.split("|").map((s) => s.trim()).filter(Boolean);
        }
        return items
            .map((item, index) => {
            // Create a child context with loop variables injected
            const loopContext = {
                ...context,
                data: {
                    ...context.data,
                    this: item, // {{this}} = current item
                    "@index": String(index),
                    "@first": index === 0 ? "true" : "",
                    "@last": index === items.length - 1 ? "true" : "",
                },
            };
            return this.renderNodes(node.body, loopContext, missing, unresolved);
        })
            .join("");
    }
}
exports.Renderer = Renderer;
//# sourceMappingURL=renderer.js.map