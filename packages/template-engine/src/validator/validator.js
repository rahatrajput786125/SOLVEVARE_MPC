"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Validator = void 0;
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
class Validator {
    validate(ast, 
    // Known variable names from TemplateVariable records
    // If null, skip variable existence check (used for preview with unknown data)
    knownVariables = null) {
        const errors = [];
        const requiredVariables = new Set();
        const aiPlaceholders = new Set();
        this.walkNodes(ast, errors, requiredVariables, aiPlaceholders, knownVariables, "root");
        return {
            valid: errors.length === 0,
            errors,
            requiredVariables,
            aiPlaceholders,
        };
    }
    // ── Private walker ───────────────────────────────────────────────────────
    walkNodes(nodes, errors, requiredVariables, aiPlaceholders, knownVariables, path) {
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
                    }
                    else {
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
exports.Validator = Validator;
//# sourceMappingURL=validator.js.map