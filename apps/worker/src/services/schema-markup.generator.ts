import { SeoFieldGenerator } from "@mpc/template-engine";

// =============================================================================
// SCHEMA MARKUP GENERATOR
//
// Generates JSON-LD structured data for each page.
// Schema types supported: LocalBusiness, Article, FAQ, BreadcrumbList,
// Product, Service, HowTo, Organization, WebSite.
//
// Strategy: template defines a schemaTemplate (JSON with {{variable}} placeholders).
// We resolve the placeholders against the data row, then validate the result.
//
// Why JSON-LD over Microdata/RDFa?
// Google recommends JSON-LD. It's easier to generate, doesn't pollute HTML,
// and can be placed anywhere in the document.
// =============================================================================

export interface GeneratedSchema {
  type: string;
  data: Record<string, unknown>;
  isValid: boolean;
}

export class SchemaMarkupGenerator {
  private seoGenerator = new SeoFieldGenerator();

  generate(
    schemaTemplate: unknown,
    data: Record<string, string>,
    seoFields: { title: string; description: string; canonicalUrl: string }
  ): GeneratedSchema[] {
    const schemas: GeneratedSchema[] = [];

    // If template has a custom schema, resolve it
    if (schemaTemplate && typeof schemaTemplate === "object") {
      const resolved = this.resolveSchemaObject(
        schemaTemplate as Record<string, unknown>,
        data
      );
      const type = (resolved["@type"] as string) ?? "Thing";
      schemas.push({ type, data: resolved, isValid: this.validate(resolved) });
    }

    // Always add BreadcrumbList — Google uses it for rich results
    schemas.push(this.buildBreadcrumb(seoFields.canonicalUrl, seoFields.title));

    // Always add WebPage schema
    schemas.push(this.buildWebPage(seoFields));

    return schemas;
  }

  // Build LocalBusiness schema — most common for programmatic SEO
  buildLocalBusiness(data: Record<string, string>): GeneratedSchema {
    const schema: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: data.business_name ?? data.name ?? data.service ?? "",
      description: data.description ?? "",
      address: {
        "@type": "PostalAddress",
        addressLocality: data.city ?? "",
        addressRegion: data.state ?? data.region ?? "",
        addressCountry: data.country ?? "US",
        postalCode: data.zip ?? data.postal_code ?? "",
        streetAddress: data.address ?? "",
      },
      telephone: data.phone ?? data.telephone ?? "",
      url: data.website ?? data.url ?? "",
      priceRange: data.price_range ?? "",
      openingHours: data.hours ?? "",
    };

    // Remove empty fields — Google ignores them but they add noise
    this.pruneEmpty(schema);

    return { type: "LocalBusiness", data: schema, isValid: this.validate(schema) };
  }

  // Build FAQ schema from AI-generated FAQ content
  buildFaq(faqContent: string): GeneratedSchema {
    // Parse FAQ content — expects format: "Q: question\nA: answer\n\n"
    const pairs = this.parseFaqContent(faqContent);

    const schema: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: pairs.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      })),
    };

    return {
      type: "FAQ",
      data: schema,
      isValid: pairs.length > 0,
    };
  }

  // Build Article schema — for blog/content pages
  buildArticle(data: Record<string, string>, seoFields: { title: string; description: string; canonicalUrl: string }): GeneratedSchema {
    const schema: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: seoFields.title,
      description: seoFields.description,
      url: seoFields.canonicalUrl,
      author: {
        "@type": "Organization",
        name: data.brand ?? data.author ?? "",
      },
      datePublished: new Date().toISOString(),
      dateModified: new Date().toISOString(),
    };

    this.pruneEmpty(schema);
    return { type: "Article", data: schema, isValid: this.validate(schema) };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildBreadcrumb(url: string, title: string): GeneratedSchema {
    // Build breadcrumb from URL path segments
    // e.g. /plumber-in-austin → Home > Plumber in Austin
    const segments = url.replace(/^https?:\/\/[^/]+/, "").split("/").filter(Boolean);
    const origin = url.replace(/^(https?:\/\/[^/]+).*/, "$1");

    const items = [
      { "@type": "ListItem", position: 1, name: "Home", item: origin },
      ...segments.map((seg, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        item: `${origin}/${segments.slice(0, i + 1).join("/")}`,
      })),
    ];

    // Override last item name with the actual page title
    if (items.length > 1) {
      items[items.length - 1].name = title;
    }

    return {
      type: "BreadcrumbList",
      data: {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items,
      },
      isValid: true,
    };
  }

  private buildWebPage(seoFields: { title: string; description: string; canonicalUrl: string }): GeneratedSchema {
    return {
      type: "WebPage",
      data: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: seoFields.title,
        description: seoFields.description,
        url: seoFields.canonicalUrl,
      },
      isValid: true,
    };
  }

  // Recursively resolve {{variable}} placeholders in a schema object
  private resolveSchemaObject(
    obj: Record<string, unknown>,
    data: Record<string, string>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        result[key] = this.seoGenerator.resolveTemplate(value, data);
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === "object" && item !== null
            ? this.resolveSchemaObject(item as Record<string, unknown>, data)
            : item
        );
      } else if (typeof value === "object" && value !== null) {
        result[key] = this.resolveSchemaObject(value as Record<string, unknown>, data);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private parseFaqContent(content: string): Array<{ question: string; answer: string }> {
    const pairs: Array<{ question: string; answer: string }> = [];
    // Match "Q: ...\nA: ..." patterns
    const regex = /Q:\s*(.+?)\nA:\s*(.+?)(?=\nQ:|\n*$)/gs;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      pairs.push({
        question: match[1].trim(),
        answer: match[2].trim(),
      });
    }

    return pairs;
  }

  private validate(schema: Record<string, unknown>): boolean {
    // Minimum validation: must have @context and @type
    return (
      typeof schema["@context"] === "string" &&
      typeof schema["@type"] === "string" &&
      schema["@type"].length > 0
    );
  }

  private pruneEmpty(obj: Record<string, unknown>): void {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val === "" || val === null || val === undefined) {
        delete obj[key];
      } else if (typeof val === "object" && !Array.isArray(val)) {
        this.pruneEmpty(val as Record<string, unknown>);
        if (Object.keys(val as object).length === 0) delete obj[key];
      }
    }
  }
}
