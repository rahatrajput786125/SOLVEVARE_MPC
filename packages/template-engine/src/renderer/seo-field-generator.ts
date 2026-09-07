import { Sanitizer } from "../sanitizer/sanitizer";
import { applyModifiers } from "../resolver/context";

// =============================================================================
// SEO FIELD GENERATOR
// Resolves the SEO template strings (title, description, slug) against
// a data row. These are simpler than full template rendering — they only
// support {{variable}} substitution, no blocks or AI.
//
// Why separate from the main renderer?
// SEO fields are rendered millions of times and must be fast.
// They also have specific constraints (title max 60 chars, desc max 160).
// =============================================================================

// NOTE: Do NOT use a shared /g regex — lastIndex bleeds between calls.
// Always create a fresh RegExp per call using this factory.
const makeVarRegex = () => /\{\{([^}]+)\}\}/g;

export interface SeoFields {
  title: string;
  description: string;
  slug: string;
  canonicalUrl: string;
  focusKeyword: string;
}

export class SeoFieldGenerator {
  private sanitizer = new Sanitizer();

  generate(
    templates: {
      titleTemplate: string;
      descriptionTemplate: string;
      slugTemplate: string;
    },
    data: Record<string, string>,
    baseUrl: string
  ): SeoFields {
    const title = this.resolveTemplate(templates.titleTemplate, data);
    const description = this.resolveTemplate(templates.descriptionTemplate, data);
    const slug = this.generateSlug(templates.slugTemplate, data);
    const canonicalUrl = `${baseUrl.replace(/\/$/, "")}/${slug}`;

    // Focus keyword: first variable value in the title template
    const focusKeyword = this.extractFocusKeyword(templates.titleTemplate, data);

    return {
      title: this.truncate(title, 60),
      description: this.truncate(description, 160),
      slug,
      canonicalUrl,
      focusKeyword,
    };
  }

  // Resolve a template string with simple {{variable}} substitution
  resolveTemplate(template: string, data: Record<string, string>): string {
    return template.replace(makeVarRegex(), (_, inner) => {
      const parts = inner.trim().split("|");
      const name = parts[0].trim();
      const modifiers = parts.slice(1).map((m: string) => m.trim());
      // Case-insensitive fallback lookup — handles CSV headers like "Services" vs "services"
      const value = this.lookupValue(data, name);
      const sanitized = this.sanitizer.sanitizeText(value);
      // Auto-slugify variables ending with _slug if no explicit modifier given
      const autoModifiers = modifiers.length === 0 && name.endsWith("_slug") ? ["slug"] : modifiers;
      return applyModifiers(sanitized, autoModifiers);
    });
  }

  // Generate a URL-safe slug from the slug template
  private generateSlug(slugTemplate: string, data: Record<string, string>): string {
    const resolved = this.resolveTemplate(slugTemplate, data);
    const slug = resolved
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100);

    // Guard: if slug is empty or only contains "in-" pattern (missing variable),
    // log a warning so it's easy to diagnose
    if (!slug || slug === "in") {
      return "page-" + Date.now();
    }
    return slug;
  }

  // Lookup value with exact match first, then case-insensitive fallback
  private lookupValue(data: Record<string, string>, name: string): string {
    if (data[name] !== undefined) return data[name];
    // Case-insensitive fallback
    const lower = name.toLowerCase();
    for (const key of Object.keys(data)) {
      if (key.toLowerCase() === lower) return data[key];
    }
    return "";
  }

  private extractFocusKeyword(titleTemplate: string, data: Record<string, string>): string {
    const match = makeVarRegex().exec(titleTemplate);
    if (!match) return "";
    const varName = match[1].trim().split("|")[0].trim();
    return this.lookupValue(data, varName);
  }

  private truncate(str: string, maxLen: number): string {
    const trimmed = str.trim();
    return trimmed.length > maxLen
      ? trimmed.slice(0, maxLen - 1).trimEnd() + "…"
      : trimmed;
  }
}
