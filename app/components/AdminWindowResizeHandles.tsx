import { MoveDiagonal2 } from "lucide-react";

/** Pointer targets for every edge; the visible corner also supports the keyboard. */
export default function AdminWindowResizeHandles() {
  return <>
    {["n", "e", "s", "w", "ne", "nw", "sw"].map(edge => (
      <span key={edge} data-admin-resize={edge} aria-hidden="true" />
    ))}
    <button
      type="button"
      data-admin-resize="se"
      aria-label="Змінити розмір вікна"
      title="Потягніть, щоб змінити розмір. Стрілки — змінити розмір, Home — відновити."
    ><MoveDiagonal2 size={14} aria-hidden="true" /></button>
  </>;
}
