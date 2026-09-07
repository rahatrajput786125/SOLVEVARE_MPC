export type AstNode = TextNode | VariableNode | AiNode | SeoNode | SchemaNode | ImageNode | IfNode | UnlessNode | EachNode;
export interface TextNode {
    kind: "text";
    value: string;
}
export interface VariableNode {
    kind: "variable";
    name: string;
    modifiers: string[];
    fallback?: string;
}
export interface AiNode {
    kind: "ai";
    placeholder: string;
    promptOverride?: string;
}
export interface SeoNode {
    kind: "seo";
    field: string;
}
export interface SchemaNode {
    kind: "schema";
    schemaType: string;
}
export interface ImageNode {
    kind: "image";
    key: string;
    alt?: string;
}
export interface IfNode {
    kind: "if";
    condition: string;
    consequent: AstNode[];
    alternate: AstNode[];
}
export interface UnlessNode {
    kind: "unless";
    condition: string;
    body: AstNode[];
}
export interface EachNode {
    kind: "each";
    arrayName: string;
    body: AstNode[];
}
//# sourceMappingURL=ast.types.d.ts.map