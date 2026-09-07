// =============================================================================
// AST NODE TYPES
// The parser converts the flat token stream into a tree.
// Each node type maps to a rendering strategy.
//
// Why a discriminated union? TypeScript narrows the type in switch/case,
// so the renderer gets full type safety when handling each node kind.
// =============================================================================

export type AstNode =
  | TextNode
  | VariableNode
  | AiNode
  | SeoNode
  | SchemaNode
  | ImageNode
  | IfNode
  | UnlessNode
  | EachNode;

// Plain text — rendered as-is (after sanitization)
export interface TextNode {
  kind: "text";
  value: string;
}

// {{city}} — resolved from the data row
export interface VariableNode {
  kind: "variable";
  name: string;         // "city"
  // Pipe modifiers: {{city|uppercase}}, {{city|slug}}
  modifiers: string[];
  // Fallback value if variable is missing: {{city|default:Unknown}}
  fallback?: string;
}

// {{ai:faq}} — async AI-generated content
export interface AiNode {
  kind: "ai";
  placeholder: string;  // "faq", "intro", "conclusion"
  // Optional inline prompt override: {{ai:faq prompt="List 5 FAQs about {{service}}"}}
  promptOverride?: string;
}

// {{seo:title}}, {{seo:description}}, {{seo:canonical}}
export interface SeoNode {
  kind: "seo";
  field: string;        // "title" | "description" | "canonical" | "robots"
}

// {{schema:LocalBusiness}}, {{schema:FAQ}}
export interface SchemaNode {
  kind: "schema";
  schemaType: string;   // "LocalBusiness" | "FAQ" | "Article" | etc.
}

// {{image:hero}}, {{image:og}}
export interface ImageNode {
  kind: "image";
  key: string;          // "hero" | "og" | "thumbnail"
  // Optional alt text: {{image:hero alt="{{service}} in {{city}}"}}
  alt?: string;
}

// {{#if condition}}...{{else}}...{{/if}}
export interface IfNode {
  kind: "if";
  condition: string;    // variable name or expression: "premium", "city"
  consequent: AstNode[];
  alternate: AstNode[]; // empty array if no {{else}}
}

// {{#unless condition}}...{{/unless}}
export interface UnlessNode {
  kind: "unless";
  condition: string;
  body: AstNode[];
}

// {{#each items}}...{{/each}}
// Inside the loop, {{this}} refers to the current item,
// {{@index}} is the 0-based index, {{@first}} and {{@last}} are booleans
export interface EachNode {
  kind: "each";
  arrayName: string;
  body: AstNode[];
}
