const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

const ESCAPE_RE = /[&<>"']/g;

/**
 * Escapes the five HTML metacharacters in a string.
 * Apply to every user-generated field that may be reflected
 * into an HTML or JSON-in-HTML context (slug, title, keyword, etc.).
 */
export function escapeHtml(value: string): string {
  return value.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}
