import { AstNode } from "../parser/ast.types";
import { RenderContext, applyModifiers, evaluateCondition } from "../resolver/context";
import { Sanitizer } from "../sanitizer/sanitizer";

// =============================================================================
// RENDERER
// Walks the AST depth-first and produces the final rendered string.
//
// Design: pure synchronous rendering.
// All async work (AI calls, DB lookups) is done BEFORE rendering
// by the AI resolver. By render time, context.aiContent is fully populated.
//
// This makes the renderer fast, simple, and testable without mocks.
// =============================================================================

export interface RenderResult {
  html: string;
  // Variables that were referenced but missing from the data row
  missingVariables: string[];
  // AI placeholders that were referenced but not resolved
  unresolvedAi: string[];
}

export class Renderer {
  private sanitizer = new Sanitizer();

  render(ast: AstNode[], context: RenderContext): RenderResult {
    const missingVariables: string[] = [];
    const unresolvedAi: string[] = [];

    const html = this.renderNodes(ast, context, missingVariables, unresolvedAi);

    return { html, missingVariables, unresolvedAi };
  }

  // ── Core render loop ─────────────────────────────────────────────────────

  private renderNodes(
    nodes: AstNode[],
    context: RenderContext,
    missing: string[],
    unresolved: string[]
  ): string {
    return nodes
      .map((node) => this.renderNode(node, context, missing, unresolved))
      .join("");
  }

  private renderNode(
    node: AstNode,
    context: RenderContext,
    missing: string[],
    unresolved: string[]
  ): string {
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

  private renderVariable(
    node: { kind: "variable"; name: string; modifiers: string[]; fallback?: string },
    context: RenderContext,
    missing: string[]
  ): string {
    // Resolution order: data row → project settings → fallback → empty string
    let value =
      context.data[node.name] ??
      context.projectSettings?.[node.name] ??
      node.fallback;

    if (value === undefined || value === null) {
      missing.push(node.name);
      value = "";
    }

    // Sanitize CSV data before injection — prevents XSS via data row
    const sanitized = this.sanitizer.sanitizeText(String(value));

    // Apply modifier pipeline
    return applyModifiers(sanitized, node.modifiers);
  }

  private renderAi(
    node: { kind: "ai"; placeholder: string },
    context: RenderContext,
    unresolved: string[]
  ): string {
    const content = context.aiContent[node.placeholder];
    if (!content) {
      unresolved.push(node.placeholder);
      return ""; // Render empty — worker will retry AI resolution
    }
    // AI content is HTML — sanitize as HTML (allows formatting tags)
    return this.sanitizer.sanitizeHtml(content);
  }

  private renderSeo(
    node: { kind: "seo"; field: string },
    context: RenderContext
  ): string {
    const seo = context.seo;
    const value = (seo as Record<string, string | undefined>)[node.field] ?? "";
    return this.sanitizer.sanitizeText(value);
  }

  private renderSchema(
    node: { kind: "schema"; schemaType: string },
    context: RenderContext
  ): string {
    const schema = context.schema.schemas[node.schemaType];
    if (!schema) return "";
    // Emit as a JSON-LD script tag — safe because we control the schema object
    return `<script type="application/ld+json">${JSON.stringify(schema, null, 2)}</script>`;
  }

  private renderImage(
    node: { kind: "image"; key: string; alt?: string },
    context: RenderContext
  ): string {
    const src = context.images.images[node.key];
    if (!src) return "";
    const safeSrc = this.sanitizer.sanitizeUrl(src);
    const safeAlt = node.alt
      ? this.sanitizer.sanitizeText(node.alt)
      : "";
    return `<img src="${safeSrc}" alt="${safeAlt}" loading="lazy" />`;
  }

  private renderIf(
    node: { kind: "if"; condition: string; consequent: AstNode[]; alternate: AstNode[] },
    context: RenderContext,
    missing: string[],
    unresolved: string[]
  ): string {
    const result = evaluateCondition(node.condition, context);
    const branch = result ? node.consequent : node.alternate;
    return this.renderNodes(branch, context, missing, unresolved);
  }

  private renderUnless(
    node: { kind: "unless"; condition: string; body: AstNode[] },
    context: RenderContext,
    missing: string[],
    unresolved: string[]
  ): string {
    const result = evaluateCondition(node.condition, context);
    if (result) return ""; // condition is true → skip the block
    return this.renderNodes(node.body, context, missing, unresolved);
  }

  private renderEach(
    node: { kind: "each"; arrayName: string; body: AstNode[] },
    context: RenderContext,
    missing: string[],
    unresolved: string[]
  ): string {
    // Array values in CSV are stored as JSON strings: '["item1","item2"]'
    // or pipe-separated: "item1|item2"
    const rawValue = context.data[node.arrayName] ?? "";
    let items: string[] = [];

    try {
      const parsed = JSON.parse(rawValue);
      items = Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
      // Fall back to pipe-separated values
      items = rawValue.split("|").map((s) => s.trim()).filter(Boolean);
    }

    return items
      .map((item, index) => {
        // Create a child context with loop variables injected
        const loopContext: RenderContext = {
          ...context,
          data: {
            ...context.data,
            this: item,           // {{this}} = current item
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
