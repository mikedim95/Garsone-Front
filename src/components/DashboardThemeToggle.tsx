import clsx from 'clsx'
import { dashboardThemeOptions, useDashboardTheme, type DashboardTheme } from '@/hooks/useDashboardDark'
import { Switch } from '@/components/ui/switch'

type DashboardThemeToggleProps = {
  className?: string
}

export const DashboardThemeToggle = ({ className }: DashboardThemeToggleProps) => {
  const {
    dashboardDark,
    setDashboardDark,
    dashboardTheme,
    setDashboardTheme,
  } = useDashboardTheme()

  return (
    <div className={clsx('space-y-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          Theme:{' '}
          <span className="font-semibold text-foreground">
            {dashboardDark ? 'Dark' : 'Light'}
          </span>
        </span>
        <Switch
          checked={dashboardDark}
          onCheckedChange={(value) => setDashboardDark(Boolean(value))}
          aria-label="Toggle dark mode"
        />
      </div>
      <div className="flex flex-col gap-2">
          {dashboardThemeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setDashboardTheme(option.value as DashboardTheme)}
              className={clsx(
                'flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-xs sm:text-sm transition-colors',
                dashboardTheme === option.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card/60 text-foreground hover:bg-accent/40'
              )}
            >
              <span
                className="inline-flex h-6 w-10 rounded-full border border-border/70 overflow-hidden"
                aria-hidden
              >
                <span 
                  className="w-1/2 h-full" 
                  style={{ backgroundColor: option.preview.light[0] }} 
                />
                <span 
                  className="w-1/2 h-full" 
                  style={{ backgroundColor: option.preview.dark[0] }} 
                />
              </span>
              <span className="text-left">
                <span className="block font-medium leading-tight">{option.label}</span>
                <span className="block text-[11px] text-muted-foreground leading-tight">
                  {option.subtitle}
                </span>
              </span>
            </button>
          ))}
      </div>
    </div>
  )
}
