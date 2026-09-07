"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeoFieldGenerator = void 0;
const sanitizer_1 = require("../sanitizer/sanitizer");
const context_1 = require("../resolver/context");
// NOTE: Do NOT use a shared /g regex — lastIndex bleeds between calls.
const makeVarRegex = () => /\{\{([^}]+)\}\}/g;
class SeoFieldGenerator {
    sanitizer = new sanitizer_1.Sanitizer();
    generate(templates, data, baseUrl) {
        const title = this.resolveTemplate(templates.titleTemplate, data);
        const description = this.resolveTemplate(templates.descriptionTemplate, data);
        const slug = this.generateSlug(templates.slugTemplate, data);
        const canonicalUrl = `${baseUrl.replace(/\/$/, "")}/${slug}`;
        const focusKeyword = this.extractFocusKeyword(templates.titleTemplate, data);
        return {
            title: this.truncate(title, 60),
            description: this.truncate(description, 160),
            slug,
            canonicalUrl,
            focusKeyword,
        };
    }
    resolveTemplate(template, data) {
        return template.replace(makeVarRegex(), (_, inner) => {
            const parts = inner.trim().split("|");
            const name = parts[0].trim();
            const modifiers = parts.slice(1).map((m) => m.trim());
            const value = this.lookupValue(data, name);
            const sanitized = this.sanitizer.sanitizeText(value);
            return (0, context_1.applyModifiers)(sanitized, modifiers);
        });
    }
    generateSlug(slugTemplate, data) {
        const resolved = this.resolveTemplate(slugTemplate, data);
        const slug = resolved
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 100);
        if (!slug || slug === "in") {
            return "page-" + Date.now();
        }
        return slug;
    }
    lookupValue(data, name) {
        if (data[name] !== undefined) return data[name];
        const lower = name.toLowerCase();
        for (const key of Object.keys(data)) {
            if (key.toLowerCase() === lower) return data[key];
        }
        return "";
    }
    extractFocusKeyword(titleTemplate, data) {
        const match = makeVarRegex().exec(titleTemplate);
        if (!match) return "";
        const varName = match[1].trim().split("|")[0].trim();
        return this.lookupValue(data, varName);
    }
    truncate(str, maxLen) {
        const trimmed = str.trim();
        return trimmed.length > maxLen
            ? trimmed.slice(0, maxLen - 1).trimEnd() + "…"
            : trimmed;
    }
}
exports.SeoFieldGenerator = SeoFieldGenerator;
