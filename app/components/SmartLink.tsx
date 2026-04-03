"use client";

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import {
  forwardRef,
  useCallback,
  useRef,
  type AnchorHTMLAttributes,
  type FocusEvent,
  type MouseEvent,
  type TouchEvent,
} from "react";

type SmartLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    prefetchOnIntent?: boolean;
  };

const SmartLink = forwardRef<HTMLAnchorElement, SmartLinkProps>(function SmartLink(
  {
    href,
    onMouseEnter,
    onFocus,
    onTouchStart,
    prefetchOnIntent = true,
    ...props
  },
  ref
) {
  const router = useRouter();
  const warmedRef = useRef(false);

  const warmRoute = useCallback(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !prefetchOnIntent ||
      warmedRef.current ||
      typeof href !== "string"
    ) {
      return;
    }
    warmedRef.current = true;
    router.prefetch(href);
  }, [href, prefetchOnIntent, router]);

  const handleMouseEnter = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      warmRoute();
      onMouseEnter?.(event);
    },
    [onMouseEnter, warmRoute]
  );

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLAnchorElement>) => {
      warmRoute();
      onFocus?.(event);
    },
    [onFocus, warmRoute]
  );

  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLAnchorElement>) => {
      warmRoute();
      onTouchStart?.(event);
    },
    [onTouchStart, warmRoute]
  );

  return (
    <Link
      ref={ref}
      href={href}
      prefetch={false}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      onTouchStart={handleTouchStart}
      {...props}
    />
  );
});

export default SmartLink;
