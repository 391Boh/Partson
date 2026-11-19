import type { ReactNode } from "react";
import HomeHeading from "./HomeHeading";

/** The three homepage pickers use the shared homepage section heading. */
export default function HomePickerHeading({ children }: { children: ReactNode }) {
  return <HomeHeading className="mb-1">{children}</HomeHeading>;
}
