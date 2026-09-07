"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sanitizer = void 0;
const jsdom_1 = require("jsdom");
const dompurify_1 = __importDefault(require("dompurify"));
// =============================================================================
// SANITIZER
//
// Why sanitize? Template variables are filled with user-uploaded CSV data.
// A malicious CSV cell could contain: <script>alert(1)</script>
// or javascript: URLs, event handlers, etc.
//
// We sanitize at the point of injection (render time), not at import time.
// This preserves the raw data in the DB and lets us re-render with
// different sanitization rules if needed.
//
// DOMPurify runs in a JSDOM environment (server-side).
// We create one window instance and reuse it — JSDOM is expensive to init.
// =============================================================================
// Singleton JSDOM window — created once, reused for all sanitization calls
const window = new jsdom_1.JSDOM("").window;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const purify = (0, dompurify_1.default)(window);
// Config for HTML content (template body) — allows safe HTML tags
const HTML_CONFIG = {
    ALLOWED_TAGS: [
        "p", "br", "strong", "em", "b", "i", "u", "s",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "ul", "ol", "li",
        "a", "img",
        "table", "thead", "tbody", "tr", "th", "td",
        "blockquote", "code", "pre",
        "div", "span", "section", "article",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "id", "target", "rel"],
    // Force all links to be safe
    FORCE_BODY: true,
};
// Config for plain text values (variable substitutions) — strips ALL HTML
const TEXT_CONFIG = {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
};
class Sanitizer {
    // Sanitize HTML content (template body, AI-generated HTML)
    sanitizeHtml(input) {
        if (!input || typeof input !== "string")
            return "";
        return purify.sanitize(input, HTML_CONFIG);
    }
    // Sanitize plain text values (CSV data injected into variables)
    // Strips all HTML — prevents XSS via data injection
    sanitizeText(input) {
        if (!input || typeof input !== "string")
            return "";
        return purify.sanitize(input, TEXT_CONFIG);
    }
    // Sanitize a URL — only allow http/https/relative URLs
    sanitizeUrl(input) {
        if (!input || typeof input !== "string")
            return "";
        const trimmed = input.trim();
        // Block javascript:, data:, vbscript: and other dangerous protocols
        if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
            return "#";
        }
        return this.sanitizeText(trimmed);
    }
}
exports.Sanitizer = Sanitizer;
//# sourceMappingURL=sanitizer.js.map