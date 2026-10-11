import type { ReactNode } from "react";

/** A single, fully linked directory. No cloned slides or hidden destinations. */
export default function DirectoryGrid({
  children,
  ariaLabel,
  variant = "compact",
}: {
  children: ReactNode;
  ariaLabel: string;
  variant?: "compact" | "groups";
}) {
  return (
    <div className={`directory-results directory-results--${variant}`} role="list" aria-label={ariaLabel}>
      {children}
    </div>
  );
}
