import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Home, LogIn, QrCode } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Link } from 'react-router-dom';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { DashboardThemeToggle } from '@/components/DashboardThemeToggle';
import { useDashboardTheme } from '@/hooks/useDashboardDark';
import { useAuthStore } from '@/store/authStore';

interface AppBurgerProps {
  className?: string;
  title?: string;
  children?: React.ReactNode; // page-specific actions
}

export const AppBurger = ({ className = '', title, children }: AppBurgerProps) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { dashboardDark, themeClass } = useDashboardTheme();
  const { user } = useAuthStore();
  const themedSheet = clsx(themeClass, { dark: dashboardDark });

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
          'w-[80vw] max-w-xs sm:max-w-sm flex flex-col bg-background text-foreground',
          themedSheet
        )}
      >
        <SheetHeader>
          <SheetTitle className="text-base font-semibold">
            {title ?? t('menu.title')}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{t('app.navigation', { defaultValue: 'Navigation' })}</h3>
            <NavLink to="/" label={t('nav.home')} icon={<Home className="h-4 w-4" />} />
            <NavLink to="/login" label={t('nav.login')} icon={<LogIn className="h-4 w-4" />} />
            {user?.role === 'architect' && (
              <NavLink to="/GarsoneAdmin" label="Garsone Admin" icon={<QrCode className="h-4 w-4" />} />
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              {t('app.preferences', { defaultValue: 'Preferences' })}
            </h3>
            <div className="flex flex-col gap-2">
              <LanguageSwitcher />
              {children}
              <DashboardThemeToggle />
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const NavLink = ({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) => (
  <Link
    to={to}
    className="flex items-center gap-2 rounded-lg border border-border/40 bg-card px-3 py-2 text-sm hover:bg-accent transition-colors"
  >
    <span className="text-primary">{icon}</span>
    <span className="">{label}</span>
  </Link>
);
