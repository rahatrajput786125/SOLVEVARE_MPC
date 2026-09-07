export interface SeoFields {
    title: string;
    description: string;
    slug: string;
    canonicalUrl: string;
    focusKeyword: string;
}
export declare class SeoFieldGenerator {
    private sanitizer;
    generate(templates: {
        titleTemplate: string;
        descriptionTemplate: string;
        slugTemplate: string;
    }, data: Record<string, string>, baseUrl: string): SeoFields;
    resolveTemplate(template: string, data: Record<string, string>): string;
    private generateSlug;
    private extractFocusKeyword;
    private truncate;
}
//# sourceMappingURL=seo-field-generator.d.ts.map