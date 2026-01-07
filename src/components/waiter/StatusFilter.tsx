import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

type StatusKey = 'PLACED' | 'PREPARING' | 'READY' | 'SERVED' | 'PAID' | 'CANCELLED' | 'ALL';

interface StatusOption {
  key: StatusKey;
  label: string;
  count?: number;
}

interface StatusFilterProps {
  options: StatusOption[];
  selected: StatusKey | null;
  onSelect: (key: StatusKey | null) => void;
  orderCounts?: Record<StatusKey, number>;
}

// Minimal, professional status indicators
const statusConfig: Record<StatusKey, { 
  indicator: string; 
  activeClass: string;
  dotClass: string;
}> = {
  PLACED: {
    indicator: '!',
    activeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
    dotClass: 'bg-amber-500',
  },
  PREPARING: {
    indicator: '⋯',
    activeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
    dotClass: 'bg-blue-500',
  },
  READY: {
    indicator: '✓',
    activeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    dotClass: 'bg-emerald-500',
  },
  SERVED: {
    indicator: '◉',
    activeClass: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30',
    dotClass: 'bg-violet-500',
  },
  PAID: {
    indicator: '✓✓',
    activeClass: 'bg-green-600/15 text-green-700 dark:text-green-400 border-green-600/30',
    dotClass: 'bg-green-600',
  },
  CANCELLED: {
    indicator: '✕',
    activeClass: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
    dotClass: 'bg-red-500',
  },
  ALL: {
    indicator: '○',
    activeClass: 'bg-primary/15 text-foreground border-primary/30',
    dotClass: 'bg-primary',
  },
};

export function StatusFilter({ options, selected, onSelect, orderCounts }: StatusFilterProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<StatusKey, HTMLButtonElement>>(new Map());
  const selectedIndex = selected ? options.findIndex(o => o.key === selected) : -1;

  // Auto-scroll to center the selected item
  useEffect(() => {
    if (scrollRef.current && selected) {
      const selectedItem = itemRefs.current.get(selected);
      if (selectedItem) {
        const container = scrollRef.current;
        const containerWidth = container.offsetWidth;
        const itemLeft = selectedItem.offsetLeft;
        const itemWidth = selectedItem.offsetWidth;
        const scrollTo = itemLeft - (containerWidth / 2) + (itemWidth / 2);
        container.scrollTo({ left: Math.max(0, scrollTo), behavior: 'smooth' });
      }
    }
  }, [selected]);

  return (
    <div className="relative w-full">
      {/* Subtle gradient fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      
      <div
        ref={scrollRef}
        className="flex items-center gap-2 px-4 py-2 overflow-x-auto scrollbar-hide scroll-smooth"
      >
        {options.map((option) => {
          const isSelected = selected === option.key;
          const config = statusConfig[option.key];
          const count = orderCounts?.[option.key] ?? option.count;
          
          return (
            <motion.button
              key={option.key}
              ref={(el) => {
                if (el) itemRefs.current.set(option.key, el);
              }}
              onClick={() => onSelect(isSelected ? null : option.key)}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border shrink-0',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isSelected
                  ? config.activeClass
                  : 'bg-card/50 text-muted-foreground border-transparent hover:bg-muted/50 hover:text-foreground'
              )}
              whileTap={{ scale: 0.95 }}
            >
              {/* Status indicator dot */}
              <span className={clsx(
                'w-2 h-2 rounded-full shrink-0 transition-colors',
                isSelected ? config.dotClass : 'bg-muted-foreground/40'
              )} />
              
              {/* Label */}
              <span className="whitespace-nowrap">{option.label}</span>
              
              {/* Count badge */}
              {count !== undefined && count > 0 && (
                <span className={clsx(
                  'min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold flex items-center justify-center',
                  isSelected 
                    ? 'bg-foreground/10' 
                    : 'bg-muted-foreground/20'
                )}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
