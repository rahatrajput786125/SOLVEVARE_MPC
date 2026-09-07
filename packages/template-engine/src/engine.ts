import { Lexer } from "./lexer/lexer";
import { Parser, TemplateParseError } from "./parser/parser";
import { Validator, ValidationResult } from "./validator/validator";
import { Renderer, RenderResult } from "./renderer/renderer";
import { SeoFieldGenerator, SeoFields } from "./renderer/seo-field-generator";
import { RenderContext } from "./resolver/context";
import { AstNode } from "./parser/ast.types";

// =============================================================================
// TEMPLATE ENGINE — Public Facade
//
// This is the only class consumers import. It hides the internal pipeline.
// The worker imports TemplateEngine and calls render().
// The API imports TemplateEngine and calls validate() for preview.
//
// Usage:
//   const engine = new TemplateEngine();
//
//   // At template save time — validate structure
//   const validation = engine.validate(templateContent, knownVariables);
//
//   // At generation time — render one page
//   const result = engine.render(template, context, baseUrl);
// =============================================================================

export interface TemplateRenderInput {
  content: string;
  titleTemplate: string;
  descriptionTemplate: string;
  slugTemplate: string;
}

export interface FullRenderResult {
  html: string;
  seo: SeoFields;
  missingVariables: string[];
  unresolvedAi: string[];
}

export class TemplateEngine {
  private lexer = new Lexer();
  private parser = new Parser();
  private validator = new Validator();
  private renderer = new Renderer();
  private seoGenerator = new SeoFieldGenerator();

  // Cache parsed ASTs — parsing is CPU-bound and the same template
  // is rendered thousands of times. Cache by template content hash.
  private astCache = new Map<string, AstNode[]>();

  // ── Public API ───────────────────────────────────────────────────────────

  // Validate a template at save time.
  // Pass knownVariables from TemplateVariable records for strict checking.
  // Pass null for lenient validation (preview mode).
  validate(
    content: string,
    knownVariables: Set<string> | null = null
  ): ValidationResult {
    try {
      const ast = this.parseWithCache(content);
      return this.validator.validate(ast, knownVariables);
    } catch (err) {
      if (err instanceof TemplateParseError) {
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
  render(
    template: TemplateRenderInput,
    context: RenderContext,
    baseUrl: string
  ): FullRenderResult {
    const ast = this.parseWithCache(template.content);
    const { html, missingVariables, unresolvedAi } = this.renderer.render(ast, context);

    const seo = this.seoGenerator.generate(
      {
        titleTemplate: template.titleTemplate,
        descriptionTemplate: template.descriptionTemplate,
        slugTemplate: template.slugTemplate,
      },
      context.data,
      baseUrl
    );

    return { html, seo, missingVariables, unresolvedAi };
  }

  // Resolve just the SEO fields — used by the sitemap generator
  // without rendering the full page body.
  resolveSeoFields(
    template: Pick<TemplateRenderInput, "titleTemplate" | "descriptionTemplate" | "slugTemplate">,
    data: Record<string, string>,
    baseUrl: string
  ): SeoFields {
    return this.seoGenerator.generate(template, data, baseUrl);
  }

  // Extract all variable names and AI placeholders from a template.
  // Used to auto-populate TemplateVariable records on template save.
  extractMetadata(content: string): {
    variables: string[];
    aiPlaceholders: string[];
  } {
    const result = this.validate(content, null);
    return {
      variables: Array.from(result.requiredVariables),
      aiPlaceholders: Array.from(result.aiPlaceholders),
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private parseWithCache(content: string): AstNode[] {
    // Use content as cache key — same template string = same AST
    // In production, use a hash (SHA-256) as the key to save memory
    const cached = this.astCache.get(content);
    if (cached) return cached;

    const tokens = this.lexer.tokenize(content);
    const ast = this.parser.parse(tokens);

    // Cap cache size to prevent memory leaks in long-running workers
    if (this.astCache.size >= 500) {
      // Evict oldest entry (Map preserves insertion order)
      const firstKey = this.astCache.keys().next().value;
      if (firstKey !== undefined) this.astCache.delete(firstKey);
    }

    this.astCache.set(content, ast);
    return ast;
  }
}

// Re-export types consumers need
export type { RenderContext, SeoFields, ValidationResult };
export { TemplateParseError };
