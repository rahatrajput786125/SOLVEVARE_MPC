export interface SeoContext {
    title?: string;
    description?: string;
    canonical?: string;
    robots?: string;
    ogImage?: string;
}
export interface SchemaContext {
    schemas: Record<string, Record<string, unknown>>;
}
export interface ImageContext {
    images: Record<string, string>;
}
export interface RenderContext {
    data: Record<string, string>;
    aiContent: Record<string, string>;
    seo: SeoContext;
    schema: SchemaContext;
    images: ImageContext;
    projectSettings?: Record<string, string>;
}
export declare function applyModifiers(value: string, modifiers: string[]): string;
export declare function evaluateCondition(condition: string, context: RenderContext): boolean;
//# sourceMappingURL=context.d.ts.map