/**
 * Serializes structured data for use in <script type="application/ld+json"> tags.
 *
 * JSON.stringify() does not escape </script>, so a product name or description
 * containing that sequence would prematurely close the script tag and allow
 * HTML injection. Replacing </ with <\/ is valid JSON (escaped forward slash)
 * and prevents the browser HTML parser from treating it as an end tag.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/<\//g, "<\\/");
}
