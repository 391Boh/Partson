"use client";

import Link, { type LinkProps } from "next/link";
import { forwardRef, type AnchorHTMLAttributes } from "react";

type SmartLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    prefetchOnIntent?: boolean;
    prefetchOnViewport?: boolean;
    prefetchOnTouch?: boolean;
  };

const SmartLink = forwardRef<HTMLAnchorElement, SmartLinkProps>(function SmartLink(
  {
    prefetch,
    prefetchOnIntent = true,
    prefetchOnViewport = false,
    prefetchOnTouch = true,
    ...props
  },
  ref
) {
  // NavigationProgress delegates intent for every link through one listener
  // and one cache. These flags also apply when this anchor's href changes.
  return (
    <Link
      ref={ref}
      {...props}
      data-prefetch-intent={prefetchOnIntent ? undefined : "false"}
      data-prefetch-touch={prefetchOnTouch ? undefined : "false"}
      prefetch={prefetch ?? prefetchOnViewport}
    />
  );
});

export default SmartLink;
