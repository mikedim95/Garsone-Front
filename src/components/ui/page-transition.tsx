import { motion, useReducedMotion } from "framer-motion";
import * as React from "react";

import { cn } from "@/lib/utils";

interface PageTransitionProps extends React.HTMLAttributes<HTMLDivElement> {}

export function PageTransition({
  children,
  className,
  ...props
}: PageTransitionProps) {
  const shouldReduceMotion = useReducedMotion();

  const motionProps = shouldReduceMotion
    ? { initial: false, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.18, ease: "easeOut" },
      };

  return (
    <motion.div
      className={cn("w-full", className)}
      {...motionProps}
      {...props}
    >
      {children}
    </motion.div>
  );
}
