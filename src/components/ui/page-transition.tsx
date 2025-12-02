import * as React from "react";

import { cn } from "@/lib/utils";

interface PageTransitionProps extends React.HTMLAttributes<HTMLDivElement> {}

export function PageTransition({
  children,
  className,
  ...props
}: PageTransitionProps) {
  return (
    <div
      className={cn("w-full animate-fade-in", className)}
      {...props}
    >
      {children}
    </div>
  );
}
