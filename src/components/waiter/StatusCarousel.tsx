import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

type StatusKey = 'PLACED' | 'PREPARING' | 'READY' | 'SERVED' | 'PAID' | 'CANCELLED' | 'ALL';

interface StatusOption {
  key: StatusKey;
  label: string;
}

interface StatusCarouselProps {
  options: StatusOption[];
  selected: StatusKey | null;
  onSelect: (key: StatusKey | null) => void;
}

// Status-specific colors - clean, no borders
const statusColors: Record<StatusKey, { bg: string; text: string; dot: string; glow: string }> = {
  PLACED: {
    bg: 'bg-amber-500',
    text: 'text-white',
    dot: 'bg-amber-500',
    glow: 'shadow-amber-500/40',
  },
  PREPARING: {
    bg: 'bg-blue-500',
    text: 'text-white',
    dot: 'bg-blue-500',
    glow: 'shadow-blue-500/40',
  },
  READY: {
    bg: 'bg-emerald-500',
    text: 'text-white',
    dot: 'bg-emerald-500',
    glow: 'shadow-emerald-500/40',
  },
  SERVED: {
    bg: 'bg-violet-500',
    text: 'text-white',
    dot: 'bg-violet-500',
    glow: 'shadow-violet-500/40',
  },
  PAID: {
    bg: 'bg-green-600',
    text: 'text-white',
    dot: 'bg-green-600',
    glow: 'shadow-green-600/40',
  },
  CANCELLED: {
    bg: 'bg-red-500',
    text: 'text-white',
    dot: 'bg-red-500',
    glow: 'shadow-red-500/40',
  },
  ALL: {
    bg: 'bg-primary',
    text: 'text-primary-foreground',
    dot: 'bg-primary',
    glow: 'shadow-primary/40',
  },
};

export function StatusCarousel({ options, selected, onSelect }: StatusCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedIndex = selected ? options.findIndex(o => o.key === selected) : -1;

  // Auto-scroll to center the selected item
  useEffect(() => {
    if (scrollRef.current && selectedIndex >= 0) {
      const container = scrollRef.current;
      const items = container.querySelectorAll('[data-status-item]');
      const selectedItem = items[selectedIndex] as HTMLElement;
      
      if (selectedItem) {
        const containerWidth = container.offsetWidth;
        const itemLeft = selectedItem.offsetLeft;
        const itemWidth = selectedItem.offsetWidth;
        const scrollTo = itemLeft - (containerWidth / 2) + (itemWidth / 2);
        container.scrollTo({ left: Math.max(0, scrollTo), behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  return (
    <div className="relative w-full">
      {/* Subtle gradient fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background via-background/80 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background via-background/80 to-transparent z-10 pointer-events-none" />
      
      <div
        ref={scrollRef}
        className="flex items-center gap-2.5 px-6 py-2 overflow-x-auto scrollbar-hide scroll-smooth"
      >
        {options.map((option) => {
          const isSelected = selected === option.key;
          const colors = statusColors[option.key];
          
          return (
            <motion.button
              key={option.key}
              data-status-item
              onClick={() => onSelect(isSelected ? null : option.key)}
              className="flex-shrink-0 focus:outline-none"
              whileTap={{ scale: 0.92 }}
            >
              <motion.div
                className={clsx(
                  'flex items-center justify-center rounded-full transition-all duration-300',
                  isSelected
                    ? [colors.bg, colors.text, colors.glow, 'px-4 py-2 shadow-lg']
                    : 'w-9 h-9 bg-muted/60 hover:bg-muted'
                )}
                layout
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              >
                {isSelected ? (
                  <span className="text-sm font-medium whitespace-nowrap">
                    {option.label}
                  </span>
                ) : (
                  <div className={clsx('w-3.5 h-3.5 rounded-full', colors.dot)} />
                )}
              </motion.div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
