import { cn } from '@/lib/utils';

interface BinaryPillToggleProps {
  active: 'left' | 'right';
  leftLabel: string;
  rightLabel: string;
  onToggle: () => void;
  className?: string;
}

export const BinaryPillToggle = ({
  active,
  leftLabel,
  rightLabel,
  onToggle,
  className,
}: BinaryPillToggleProps) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'relative inline-flex items-center justify-between rounded-full border border-border/60 bg-card px-1 py-1 text-[11px] sm:text-xs font-medium shadow-sm transition-colors',
        className
      )}
      aria-pressed={active === 'right'}
    >
      <span
        className={cn(
          'relative z-10 flex-1 text-center transition-colors',
          active === 'left' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {leftLabel}
      </span>
      <span
        className={cn(
          'relative z-10 flex-1 text-center transition-colors',
          active === 'right' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {rightLabel}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-1 w-1/2 rounded-full bg-primary/10 border border-primary/40 shadow-sm transition-transform duration-200',
          active === 'left' ? 'translate-x-0 left-1' : 'translate-x-full -left-1'
        )}
      />
    </button>
  );
};

