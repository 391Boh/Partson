# Blog and article reading

Mode: Read. Routes: `/blog` and `/blog/[slug]`.

Keep PartsON’s established navy, teal and Exo 2 identity. Article photography uses the existing text-free editorial WebP series; later uploads and removals retain their existing precedence. Published copy, dates, author links, metadata, structured data and administration remain the source of truth.

The index leads with a large two-part title and a short introduction. The featured article combines full-width photography with a dark left-to-right scrim and left-aligned text. Remaining stories form an open three/two/one-column editorial grid, with photographs, metadata, distinct titles and a quiet rule separating rows. On phones the feature image sits above its copy so neither obscures the other.

Article openings reuse the photographic treatment across the screen width. On phones the heading, description and byline precede a complete 16:9 photograph. The body uses a centered 720px reading column, 18px desktop / 17px mobile text, generous paragraph spacing and distinctly weighted headings. The contents navigation is sticky beside the body on desktop and a native disclosure above it on smaller screens. Related articles have compact photo thumbnails.

Headings have no decorative shadow or italic slant. Reset inherited variable-font axes for links and emphasis so actual font weights govern hierarchy. Reading text can be selected and copied. Hover uses a restrained photo zoom and directional arrows on fine pointers, with visible keyboard focus and reduced-motion support. No new client JavaScript, dependencies or fonts are needed.

Validation: TypeScript, targeted ESLint, production CSS compilation and whitespace checks. Live browser checks cover 320, 390, 768, 1440 and 1920px, both routes, a long article title, native contents disclosure, valid contents anchors, keyboard focus, reduced motion and horizontal overflow. Captures and the temporary browser harness are in `output/blog-design/`.
