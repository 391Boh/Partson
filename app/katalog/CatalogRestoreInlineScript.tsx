"use client";

// The restore check has to run while the HTML is parsed, before the
// server-rendered grid paints, so it ships as an inline <script>. React only
// executes it from the SSR HTML; when /katalog is reached by client
// navigation the element is created by React, never runs (by design), and
// React 19 warns about it. On the client it is therefore marked with a
// non-executable type: the SSR copy keeps the default type and still runs,
// and suppressHydrationWarning keeps the attribute difference silent.
export default function CatalogRestoreInlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? undefined : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
