import { escapeHtml } from "./xss";

describe("escapeHtml", () => {
  it("escapes all five HTML metacharacters", () => {
    expect(escapeHtml(`<script>alert("xss")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#x27;s");
  });

  it("leaves safe strings untouched", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});
