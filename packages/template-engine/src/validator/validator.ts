import { AstNode } from "../parser/ast.types";

// =============================================================================
// VALIDATOR
// Walks the AST before rendering and collects all issues.
//
// Why validate before rendering?
// Rendering is async (AI calls, DB lookups). If we discover a missing
// variable halfway through rendering 10,000 pages, we've wasted API credits
// and time. Validate the template once against a sample row upfront.
//
// Returns all errors at once (not just the first) so the user can fix
// everything in one pass.
// =============================================================================

export interface ValidationError {
  message: string;
  path: string;   // e.g. "if.condition", "each.body[2].variable"
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  // All variable names referenced in the template
  requiredVariables: Set<string>;
  // All AI placeholders referenced
  aiPlaceholders: Set<string>;
}

// Valid modifier names — reject unknown modifiers early
const VALID_MODIFIERS = new Set([
  "uppercase",
  "lowercase",
  "capitalize",
  "slug",
  "trim",
  "truncate",
  "number",
  "currency",
  "url_encode",
]);

export class Validator {
  validate(
    ast: AstNode[],
    // Known variable names from TemplateVariable records
    // If null, skip variable existence check (used for preview with unknown data)
    knownVariables: Set<string> | null = null
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const requiredVariables = new Set<string>();
    const aiPlaceholders = new Set<string>();

    this.walkNodes(ast, errors, requiredVariables, aiPlaceholders, knownVariables, "root");

    return {
      valid: errors.length === 0,
      errors,
      requiredVariables,
      aiPlaceholders,
    };
  }

  // ── Private walker ───────────────────────────────────────────────────────

  private walkNodes(
    nodes: AstNode[],
    errors: ValidationError[],
    requiredVariables: Set<string>,
    aiPlaceholders: Set<string>,
    knownVariables: Set<string> | null,
    path: string
  ): void {
    nodes.forEach((node, i) => {
      const nodePath = `${path}[${i}]`;

      switch (node.kind) {
        case "text":
          break; // nothing to validate

        case "variable": {
          requiredVariables.add(node.name);

          // Check variable exists in known set
          if (knownVariables && !knownVariables.has(node.name)) {
            errors.push({
              message: `Unknown variable "{{${node.name}}}" — not declared in template variables`,
              path: nodePath,
            });
          }

          // Validate modifiers
          for (const mod of node.modifiers) {
            const modName = mod.split(":")[0]; // handle "truncate:100"
            if (!VALID_MODIFIERS.has(modName)) {
              errors.push({
                message: `Unknown modifier "${mod}" on variable "{{${node.name}}}"`,
                path: nodePath,
              });
            }
          }
          break;
        }

        case "ai": {
          aiPlaceholders.add(node.placeholder);

          // AI placeholder names must be alphanumeric + underscore
          if (!/^[a-z_][a-z0-9_]*$/.test(node.placeholder)) {
            errors.push({
              message: `Invalid AI placeholder name "${node.placeholder}" — use lowercase letters, numbers, underscores`,
              path: nodePath,
            });
          }
          break;
        }

        case "if":
        case "unless": {
          // Condition must reference a known variable
          const condition = node.condition;
          requiredVariables.add(condition.split(" ")[0]); // "plan == starter" → "plan"

          if (node.kind === "if") {
            this.walkNodes(node.consequent, errors, requiredVariables, aiPlaceholders, knownVariables, `${nodePath}.consequent`);
            this.walkNodes(node.alternate, errors, requiredVariables, aiPlaceholders, knownVariables, `${nodePath}.alternate`);
          } else {
            this.walkNodes(node.body, errors, requiredVariables, aiPlaceholders, knownVariables, `${nodePath}.body`);
          }
          break;
        }

        case "each": {
          requiredVariables.add(node.arrayName);
          this.walkNodes(node.body, errors, requiredVariables, aiPlaceholders, knownVariables, `${nodePath}.body`);
          break;
        }

        case "seo":
        case "schema":
        case "image":
          break; // resolved by the renderer from context, not data row
      }
    });
  }
}
