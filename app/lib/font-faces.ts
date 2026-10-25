// Define faces once in the server head. Repeating them in both critical and
// deferred CSS restarts font-display timing and can swap metrics after paint.
export const FONT_FACE_CSS = `@font-face {
  font-family: "Exo 2";
  src: url("/fonts/exo2-variable.woff2") format("woff2-variations");
  font-style: normal;
  font-weight: 400 900;
  /* Avoid a late metric-changing font swap after the hero has painted. The
     font is preloaded in layout.tsx, so it is still used on normal loads; on
     a very slow connection the stable system fallback wins for this visit. */
  font-display: optional;
}

/* The homepage only needs Latin/Cyrillic and punctuation. Other scripts
   remain available from the complete face above, fetched only when used. */
@font-face {
  font-family: "Exo 2";
  src: url("/fonts/exo2-latin-cyrillic.woff2") format("woff2-variations");
  font-style: normal;
  font-weight: 400 900;
  font-display: optional;
  unicode-range: U+0000-052F, U+1E00-1EFF, U+2000-206F, U+20A0-20CF, U+2116, U+2122, U+2212, U+FEFF, U+FFFD;
}

`;
