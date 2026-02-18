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

    <div className="max-w-6xl mx-auto px-4 py-8 flex-1 w-full">
      <div className="relative mb-6">
        <div className="relative flex gap-2 overflow-x-auto pb-2 items-center scrollbar-hide scroll-smooth">
          <Skeleton className="shrink-0 h-10 w-10 rounded-full" />
          {[88, 84, 96, 80, 92].map((width, i) => (
            <Skeleton
              key={`chip-${i}`}
              className="shrink-0 h-9 rounded-full"
              style={{ width }}
            />
          ))}
        </div>
      </div>

      <div className="overflow-hidden pb-32">
        <div className="flex">
          <div className="flex-[0_0_100%] min-w-0 px-1">
            {[0, 1].map((sectionIdx) => (
              <div key={`section-${sectionIdx}`}>
                <div className="relative flex items-center gap-4 my-8">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-border/30" />
                  <Skeleton className="h-6 w-32 rounded-full" />
                  <div className="flex-1 h-px bg-gradient-to-l from-transparent via-border to-border/30" />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div
                      key={`card-${sectionIdx}-${idx}`}
                      className="relative overflow-hidden rounded-2xl border-0 bg-card/40 backdrop-blur-sm shadow-lg"
                    >
                      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
                        <Skeleton className="absolute inset-0 rounded-none" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10 pointer-events-none" />
                        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 space-y-2">
                          <Skeleton className="h-4 w-4/5 rounded bg-white/25" />
                          <div className="flex items-center justify-between">
                            <Skeleton className="h-6 w-16 rounded-full bg-white/25" />
                            <Skeleton className="h-8 w-8 rounded-full bg-white/20" />
                          </div>
                        </div>
                        <Skeleton className="absolute top-3 right-3 h-6 w-6 rounded-full bg-white/20" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 px-2 py-1.5 rounded-full bg-card/70 backdrop-blur-xl border border-border/20 shadow-lg">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="relative">
            <Skeleton className="h-10 w-32 rounded-full" />
            <Skeleton className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  </div>
);
