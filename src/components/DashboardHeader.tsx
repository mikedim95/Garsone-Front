import { ReactNode } from 'react';
import { AppBurger } from '@/pages/AppBurger';

interface DashboardHeaderProps {
  title: string;
  subtitle?: ReactNode;
  icon?: string;
  gradientFrom?: string;
  gradientTo?: string;
  burgerActions?: ReactNode;
  rightContent?: ReactNode;
}

export const DashboardHeader = ({
  title,
  subtitle,
  icon = '📊',
  gradientFrom = 'from-primary',
  gradientTo = 'to-primary',
  burgerActions,
  rightContent,
}: DashboardHeaderProps) => {
  return (
    <header className="bg-card/80 backdrop-blur-lg border-b border-border sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:py-5 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${gradientFrom} ${gradientTo} flex items-center justify-center shadow-lg flex-shrink-0`}>
            <span className="text-xl sm:text-2xl md:text-3xl">{icon}</span>
          </div>
          <div className="min-w-0">
            <h1 className={`text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r ${gradientFrom} ${gradientTo} bg-clip-text text-transparent truncate`}>
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
          {rightContent && (
            <div className="hidden sm:flex items-center ml-auto">
              {rightContent}
            </div>
          )}
        </div>
        <div className="flex gap-2 items-center flex-shrink-0">
          <AppBurger title={title}>
            {burgerActions}
          </AppBurger>
        </div>
      </div>
    </header>
  );
};
