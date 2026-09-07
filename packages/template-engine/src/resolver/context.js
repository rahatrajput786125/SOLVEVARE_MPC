"use strict";
// =============================================================================
// RENDER CONTEXT
// Everything the renderer needs to resolve a template.
// Passed in from the page generation worker.
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyModifiers = applyModifiers;
exports.evaluateCondition = evaluateCondition;
const MODIFIERS = {
    uppercase: (v) => v.toUpperCase(),
    lowercase: (v) => v.toLowerCase(),
    capitalize: (v) => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(),
    // Convert to URL-safe slug: "New York City" → "new-york-city"
    slug: (v) => v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    trim: (v) => v.trim(),
    // Truncate to N chars with ellipsis: {{description|truncate:160}}
    truncate: (v, arg) => {
        const len = parseInt(arg ?? "100", 10);
        return v.length > len ? v.slice(0, len).trimEnd() + "…" : v;
    },
    // Format as number with commas: "1000000" → "1,000,000"
    number: (v) => {
        const n = parseFloat(v);
        return isNaN(n) ? v : n.toLocaleString("en-US");
    },
    // Format as USD currency: "1500" → "$1,500.00"
    currency: (v) => {
        const n = parseFloat(v);
        return isNaN(n)
            ? v
            : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
    },
    url_encode: (v) => encodeURIComponent(v),
};
function applyModifiers(value, modifiers) {
    return modifiers.reduce((acc, mod) => {
        // Handle modifiers with arguments: "truncate:160"
        const colonIdx = mod.indexOf(":");
        const name = colonIdx >= 0 ? mod.slice(0, colonIdx) : mod;
        const arg = colonIdx >= 0 ? mod.slice(colonIdx + 1) : undefined;
        const fn = MODIFIERS[name];
        return fn ? fn(acc, arg) : acc;
    }, value);
}
// =============================================================================
// CONDITION EVALUATOR
// Evaluates {{#if condition}} expressions against the render context.
//
// Supported expressions:
//   "city"              → truthy if data.city is non-empty
//   "plan == starter"   → equality check
//   "plan != enterprise"→ inequality check
//   "count > 5"         → numeric comparison
// =============================================================================
function evaluateCondition(condition, context) {
    const trimmed = condition.trim();
    // Equality: "plan == starter"
    const eqMatch = trimmed.match(/^(\w+)\s*==\s*(.+)$/);
    if (eqMatch) {
        const val = resolveValue(eqMatch[1], context);
        return val === eqMatch[2].trim();
    }
    // Inequality: "plan != enterprise"
    const neqMatch = trimmed.match(/^(\w+)\s*!=\s*(.+)$/);
    if (neqMatch) {
        const val = resolveValue(neqMatch[1], context);
        return val !== neqMatch[2].trim();
    }
    // Numeric greater than: "count > 5"
    const gtMatch = trimmed.match(/^(\w+)\s*>\s*(\d+)$/);
    if (gtMatch) {
        const val = parseFloat(resolveValue(gtMatch[1], context) ?? "0");
        return val > parseFloat(gtMatch[2]);
    }
    // Numeric less than: "count < 5"
    const ltMatch = trimmed.match(/^(\w+)\s*<\s*(\d+)$/);
    if (ltMatch) {
        const val = parseFloat(resolveValue(ltMatch[1], context) ?? "0");
        return val < parseFloat(ltMatch[2]);
    }
    // Simple truthy check: "city" → true if data.city is non-empty
    const val = resolveValue(trimmed, context);
    return Boolean(val && val.trim() !== "");
}
function resolveValue(name, context) {
    return (context.data[name] ??
        context.projectSettings?.[name] ??
        "");
}
//# sourceMappingURL=context.js.map