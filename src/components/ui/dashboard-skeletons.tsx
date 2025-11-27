import * as React from "react";

import { cn } from "@/lib/utils";
import { Card } from "./card";
import { Skeleton } from "./skeleton";

type DashboardCardSkeletonProps = {
  lines?: number;
  className?: string;
  showBadge?: boolean;
};

export function DashboardCardSkeleton({
  lines = 3,
  className,
  showBadge = true,
}: DashboardCardSkeletonProps) {
  return (
    <Card
      interactive={false}
      className={cn(
        "p-4 sm:p-5 bg-muted/40 border-border/70 shadow-none",
        className
      )}
    >
      <div className="flex items-start justify-between mb-3 gap-3">
        <Skeleton className="h-4 w-28 sm:w-32" />
        {showBadge ? <Skeleton className="h-6 w-6 rounded-full" /> : null}
      </div>
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, idx) => (
          <Skeleton
            key={idx}
            className={cn("h-3 w-full", idx === 0 ? "w-5/6" : undefined)}
          />
        ))}
      </div>
    </Card>
  );
}

type DashboardGridSkeletonProps = {
  count?: number;
  className?: string;
};

export function DashboardGridSkeleton({
  count = 6,
  className,
}: DashboardGridSkeletonProps) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:gap-6 md:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {Array.from({ length: count }).map((_, idx) => (
        <DashboardCardSkeleton key={idx} />
      ))}
    </div>
  );
}
