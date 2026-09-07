import { TemplateParseError } from "./parser/parser";
import { ValidationResult } from "./validator/validator";
import { SeoFields } from "./renderer/seo-field-generator";
import { RenderContext } from "./resolver/context";
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
export declare class TemplateEngine {
    private lexer;
    private parser;
    private validator;
    private renderer;
    private seoGenerator;
    private astCache;
    validate(content: string, knownVariables?: Set<string> | null): ValidationResult;
    render(template: TemplateRenderInput, context: RenderContext, baseUrl: string): FullRenderResult;
    resolveSeoFields(template: Pick<TemplateRenderInput, "titleTemplate" | "descriptionTemplate" | "slugTemplate">, data: Record<string, string>, baseUrl: string): SeoFields;
    extractMetadata(content: string): {
        variables: string[];
        aiPlaceholders: string[];
    };
    private parseWithCache;
}
export type { RenderContext, SeoFields, ValidationResult };
export { TemplateParseError };
//# sourceMappingURL=engine.d.ts.map