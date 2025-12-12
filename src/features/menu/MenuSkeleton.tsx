import { Skeleton } from "@/components/ui/skeleton";

export const MenuSkeleton = () => (
  <div className="min-h-screen min-h-dvh dashboard-bg overflow-hidden text-foreground flex flex-col">
    <header className="bg-card/80 backdrop-blur border-b border-border sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-48 rounded-full" />
        </div>
        <div className="flex gap-2 items-center">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>
    </header>

    <div className="max-w-6xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
      <div className="flex gap-2 overflow-x-auto pb-2 items-center">
        <Skeleton className="h-9 w-9 rounded-full" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton
            key={`chip-${i}`}
            className="h-9 w-24 rounded-full shrink-0"
          />
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={`card-${idx}`}
            className="rounded-3xl border border-border/60 bg-card/60 p-4 space-y-3 shadow-sm"
          >
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-5 w-2/3 rounded-full" />
            <Skeleton className="h-4 w-full rounded-full" />
            <div className="flex items-center justify-between pt-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-9 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
