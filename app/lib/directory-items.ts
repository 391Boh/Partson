/** Remove repeated destinations without merging distinct parts or generations. */
export function uniqueDirectoryItems<T>(items: readonly T[], destination: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = destination(item).normalize("NFKC").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
