import type { ReactNode } from "react";

/** The three homepage pickers share hierarchy, while keeping their own flow. */
export default function HomePickerHeading({ children }: { children: ReactNode }) {
  return <h2 className="home-picker-title font-display font-display-readable">{children}</h2>;
}
