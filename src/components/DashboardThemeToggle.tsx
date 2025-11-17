import { Switch } from '@/components/ui/switch'
import { useDashboardDark } from '@/hooks/useDashboardDark'

export const DashboardThemeToggle = () => {
  const { dashboardDark, setDashboardDark } = useDashboardDark()
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <Switch checked={dashboardDark} onCheckedChange={(value)=> setDashboardDark(Boolean(value))} />
      Dark dashboards
    </label>
  )
}
