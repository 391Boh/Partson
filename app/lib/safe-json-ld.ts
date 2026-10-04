/** Serialize JSON-LD without allowing HTML parser control sequences in data. */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
