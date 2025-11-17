import clsx from 'clsx'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { dashboardThemeOptions, useDashboardTheme, type DashboardTheme } from '@/hooks/useDashboardDark'

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
    <div
      className={clsx(
        'rounded-3xl border border-border bg-card/80 backdrop-blur-xl px-5 py-4 shadow-xl flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div>
        <p className="text-sm font-semibold text-foreground">Dashboard Theme</p>
        <p className="text-xs text-muted-foreground">
          Choose an immersive palette and toggle light or dark mode.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <Switch checked={dashboardDark} onCheckedChange={(value) => setDashboardDark(Boolean(value))} />
          {dashboardDark ? 'Dark mode' : 'Light mode'}
        </label>
        <Select value={dashboardTheme} onValueChange={(value: DashboardTheme) => setDashboardTheme(value)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select theme" />
          </SelectTrigger>
          <SelectContent>
            {dashboardThemeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-6 w-10 rounded-full border border-border/70"
                    style={{
                      background: `linear-gradient(120deg, ${option.preview[0]}, ${option.preview[1]})`,
                    }}
                    aria-hidden
                  />
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">{option.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {option.subtitle}
                    </p>
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
