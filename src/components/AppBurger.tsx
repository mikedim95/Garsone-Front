import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Palette } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DashboardThemeToggle } from '@/components/DashboardThemeToggle';
import { useDashboardTheme } from '@/hooks/useDashboardDark';

interface AppBurgerProps {
  className?: string;
  title?: string;
  children?: React.ReactNode; // page-specific actions
  showChildren?: boolean;
  themeOnly?: boolean;
}

export const AppBurger = ({
  className = '',
  title,
  children,
  showChildren = true,
  themeOnly = false,
}: AppBurgerProps) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { dashboardDark, themeClass } = useDashboardTheme();
  const themedSheet = clsx(themeClass, { dark: dashboardDark });
  const drawerTitle = themeOnly
    ? t('app.theme_settings', { defaultValue: 'Theme settings' })
    : title ?? t('menu.title');

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className={`relative inline-flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-lg border border-border/60 bg-card/80 hover:bg-accent transition-colors duration-150 ${className}`}
          aria-label="Open menu"
        >
          {/* Animated burger */}
          <span className={`block w-5 h-0.5 bg-foreground rounded absolute transition-transform duration-200 ${open ? 'rotate-45' : '-translate-y-1'}`} />
          <span className={`block w-5 h-0.5 bg-foreground rounded absolute transition-opacity duration-200 ${open ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`block w-5 h-0.5 bg-foreground rounded absolute transition-transform duration-200 ${open ? '-rotate-45' : 'translate-y-1'}`} />
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className={clsx(
          'w-[320px] sm:w-[360px] bg-background text-foreground rounded-2xl border-border/80 shadow-2xl my-4 mr-4 h-auto max-h-[80vh] overflow-y-auto',
          themedSheet
        )}
      >
        <SheetHeader>
          <SheetTitle className="text-base font-semibold">
            {drawerTitle}
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 py-3 space-y-4">
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              <Palette className="h-3.5 w-3.5" />
              {t('app.theme_only', { defaultValue: 'Theme only' })}
            </h3>
            <div className="flex flex-col gap-2">
              {showChildren ? children : null}
              <DashboardThemeToggle />
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
};
