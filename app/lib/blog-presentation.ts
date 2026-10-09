export const blogReadingMinutes = (content: string) =>
  Math.max(
    1,
    Math.ceil(content.trim().split(/\s+/).filter(Boolean).length / 200),
  );

export const formatBlogDate = (value?: string) => {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
};
