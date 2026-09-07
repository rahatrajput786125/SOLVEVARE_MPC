// =============================================================================
// RENDER CONTEXT
// Everything the renderer needs to resolve a template.
// Passed in from the page generation worker.
// =============================================================================

export interface SeoContext {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string;
  ogImage?: string;
}

export interface SchemaContext {
  // Map of schema type → pre-built JSON-LD object
  // e.g. { "LocalBusiness": { "@type": "LocalBusiness", "name": "...", ... } }
  schemas: Record<string, Record<string, unknown>>;
}

export interface ImageContext {
  // Map of image key → URL
  // e.g. { "hero": "https://cdn.example.com/hero.jpg" }
  images: Record<string, string>;
}

export interface RenderContext {
  // The CSV data row — primary variable source
  data: Record<string, string>;

  // AI-generated content, keyed by placeholder name
  // Populated by the AI resolver before rendering
  aiContent: Record<string, string>;

  // SEO metadata
  seo: SeoContext;

  // Schema markup
  schema: SchemaContext;

  // Image URLs
  images: ImageContext;

  // Project-level settings (brand name, default city, etc.)
  projectSettings?: Record<string, string>;
}

// =============================================================================
// MODIFIER PIPELINE
// Applied to variable values: {{city|uppercase|slug}}
// Modifiers are applied left to right.
// =============================================================================

type ModifierFn = (value: string, arg?: string) => string;

const MODIFIERS: Record<string, ModifierFn> = {
  uppercase: (v) => v.toUpperCase(),
  lowercase: (v) => v.toLowerCase(),
  capitalize: (v) => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(),

  // Convert to URL-safe slug: "New York City" → "new-york-city"
  slug: (v) =>
    v
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

export function applyModifiers(value: string, modifiers: string[]): string {
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

export function evaluateCondition(
  condition: string,
  context: RenderContext
): boolean {
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

function resolveValue(name: string, context: RenderContext): string {
  return (
    context.data[name] ??
    context.projectSettings?.[name] ??
    ""
  );
}
