import { ReactNode } from 'react';
import { AppBurger } from '@/pages/AppBurger';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTheme } from '@/components/theme-provider-context';
import { Sun, Moon } from 'lucide-react';

interface DashboardHeaderProps {
  title: string;
  subtitle?: ReactNode;
  icon?: string;
  tone?: 'primary' | 'secondary' | 'accent';
  burgerActions?: ReactNode;
  rightContent?: ReactNode;
}

export const DashboardHeader = ({
  title,
  subtitle,
  icon = '📊',
  tone = 'primary',
  burgerActions,
  rightContent,
}: DashboardHeaderProps) => {
  const gradientClass =
    {
      primary: 'bg-gradient-primary',
      secondary: 'bg-gradient-secondary',
      accent: 'bg-gradient-accent',
    }[tone] || 'bg-gradient-primary';

  const titleColorClass =
    tone === 'secondary'
      ? 'text-secondary-foreground'
      : tone === 'accent'
        ? 'text-accent-foreground'
        : 'text-primary';

  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  return (
    <header className="bg-card/80 backdrop-blur-lg border-b border-border sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:py-5 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${gradientClass} flex items-center justify-center shadow-lg flex-shrink-0`}>
            <span className="text-xl sm:text-2xl md:text-3xl">{icon}</span>
          </div>
          <div className="min-w-0">
            <h1 className={`text-lg sm:text-xl md:text-2xl font-bold ${titleColorClass} truncate`}>
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rightContent ? (
            <div className="hidden sm:flex items-center text-sm font-medium text-foreground mr-2">
              {rightContent}
            </div>
          ) : null}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-border/60 bg-card/80 shadow-sm hover:bg-accent transition-colors"
          >
            {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
          <LanguageSwitcher />
          <AppBurger title={title}>
            {burgerActions}
          </AppBurger>
        </div>
      </div>
    </header>
  );
};
