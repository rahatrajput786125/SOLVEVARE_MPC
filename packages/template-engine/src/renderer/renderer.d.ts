import { AstNode } from "../parser/ast.types";
import { RenderContext } from "../resolver/context";
export interface RenderResult {
    html: string;
    missingVariables: string[];
    unresolvedAi: string[];
}
export declare class Renderer {
    private sanitizer;
    render(ast: AstNode[], context: RenderContext): RenderResult;
    private renderNodes;
    private renderNode;
    private renderVariable;
    private renderAi;
    private renderSeo;
    private renderSchema;
    private renderImage;
    private renderIf;
    private renderUnless;
    private renderEach;
}
//# sourceMappingURL=renderer.d.ts.map