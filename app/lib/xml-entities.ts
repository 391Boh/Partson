import "server-only";

const VALID_XML_ENTITY_PATTERN =
  /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g;

export const normalizeInvalidXmlEntities = (xml: string) =>
  (xml || "").replace(VALID_XML_ENTITY_PATTERN, "&amp;");
