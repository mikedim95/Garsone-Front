import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { format, subDays, subHours, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import clsx from 'clsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

type PresetKey = 'today' | 'last24h' | 'week' | 'custom';

interface TimeRangePickerProps {
  value: PresetKey;
  onChange: (value: PresetKey) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (date: string) => void;
  onCustomEndChange: (date: string) => void;
}

const presets: Array<{ key: PresetKey; label: string; shortLabel: string }> = [
  { key: 'today', label: 'Today', shortLabel: 'Today' },
  { key: 'last24h', label: 'Last 24h', shortLabel: '24h' },
  { key: 'week', label: 'This Week', shortLabel: 'Week' },
  { key: 'custom', label: 'Custom', shortLabel: 'Custom' },
];

export function TimeRangePicker({
  value,
  onChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
}: TimeRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectingStart, setSelectingStart] = useState(true);

  const selectedPreset = presets.find(p => p.key === value);
  
  const getDisplayLabel = () => {
    if (value === 'custom') {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      return `${format(start, 'MMM d')} — ${format(end, 'MMM d')}`;
    }
    return selectedPreset?.shortLabel || 'Today';
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    const formatted = format(date, 'yyyy-MM-dd');
    
    if (selectingStart) {
      onCustomStartChange(formatted);
      setSelectingStart(false);
    } else {
      onCustomEndChange(formatted);
      setSelectingStart(true);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <motion.button
          className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-xl',
            'bg-card/80 backdrop-blur-sm',
            'text-sm font-medium text-foreground',
            'hover:bg-card transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
          )}
          whileTap={{ scale: 0.97 }}
        >
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span>{getDisplayLabel()}</span>
          <ChevronDown className={clsx(
            'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-180'
          )} />
        </motion.button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-auto p-0 bg-card/95 backdrop-blur-xl border-border/50 shadow-2xl rounded-2xl overflow-hidden" 
        align="end"
        sideOffset={8}
      >
        <div className="p-1">
          {/* Preset options */}
          <div className="flex gap-1 p-2">
            {presets.map((preset) => (
              <motion.button
                key={preset.key}
                onClick={() => {
                  onChange(preset.key);
                  if (preset.key !== 'custom') {
                    setIsOpen(false);
                  }
                }}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  value === preset.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
                whileTap={{ scale: 0.95 }}
              >
                {preset.label}
              </motion.button>
            ))}
          </div>
          
          {/* Custom date picker */}
          <AnimatePresence>
            {value === 'custom' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="border-t border-border/30 pt-3 pb-2 px-2">
                  {/* Date range display */}
                  <div className="flex items-center justify-between mb-3 px-2">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectingStart(true)}
                        className={clsx(
                          'px-3 py-1.5 rounded-lg text-sm transition-all',
                          selectingStart
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {format(new Date(customStart), 'MMM d, yyyy')}
                      </button>
                      <span className="text-muted-foreground">→</span>
                      <button
                        onClick={() => setSelectingStart(false)}
                        className={clsx(
                          'px-3 py-1.5 rounded-lg text-sm transition-all',
                          !selectingStart
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {format(new Date(customEnd), 'MMM d, yyyy')}
                      </button>
                    </div>
                  </div>
                  
                  {/* Calendar */}
                  <CalendarComponent
                    mode="single"
                    selected={selectingStart ? new Date(customStart) : new Date(customEnd)}
                    onSelect={handleDateSelect}
                    className="p-2 pointer-events-auto"
                    classNames={{
                      day_selected: 'bg-primary text-primary-foreground hover:bg-primary',
                      day_today: 'bg-muted text-foreground',
                    }}
                  />
                  
                  {/* Apply button */}
                  <div className="px-2 pt-2 border-t border-border/30 mt-2">
                    <motion.button
                      onClick={() => setIsOpen(false)}
                      className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                      whileTap={{ scale: 0.98 }}
                    >
                      Apply Range
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </PopoverContent>
    </Popover>
  );
}
