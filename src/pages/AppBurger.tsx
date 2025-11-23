import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Home, LogIn, LogOut } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Link, useNavigate } from 'react-router-dom';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { DashboardThemeToggle } from '@/components/DashboardThemeToggle';
import { useDashboardTheme } from '@/hooks/useDashboardDark';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';

interface AppBurgerProps {
  className?: string;
  title?: string;
  children?: React.ReactNode; // page-specific actions
}

export const AppBurger = ({ className = '', title, children }: AppBurgerProps) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { dashboardDark, themeClass } = useDashboardTheme();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const themedSheet = clsx(themeClass, { dark: dashboardDark });

  const displayName = user?.displayName || user?.email || t('auth.guest', { defaultValue: 'Guest' });
  const email = user?.email || '';
  const roleKey = user?.role;
  const roleLabel =
    roleKey === 'manager'
      ? t('manager.dashboard', { defaultValue: 'Manager' })
      : roleKey === 'waiter'
        ? t('waiter.dashboard', { defaultValue: 'Waiter' })
        : roleKey === 'cook'
          ? t('cook.dashboard', { defaultValue: 'Cook' })
          : t('auth.guest', { defaultValue: 'Guest' });
  const initials = (displayName || 'G')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/login');
  };

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
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              {t('app.profile', { defaultValue: 'Profile' })}
            </h3>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/40 flex items-center justify-center text-xs font-semibold text-primary shadow-sm">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{displayName}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {email || t('auth.not_signed_in', { defaultValue: 'Not signed in' })}
                </p>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5 uppercase tracking-wide">
                  {roleLabel}
                </p>
              </div>
            </div>
            {user && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t('actions.logout', { defaultValue: 'Logout' })}
              </Button>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{t('app.navigation', { defaultValue: 'Navigation' })}</h3>
            <NavLink to="/" label={t('nav.home')} icon={<Home className="h-4 w-4" />} />
            <NavLink to="/login" label={t('nav.login')} icon={<LogIn className="h-4 w-4" />} />
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
