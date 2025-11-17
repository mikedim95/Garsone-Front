import { Switch } from '@/components/ui/switch'
import { useTheme } from '@/components/theme-provider-context'

export const AppThemeSwitch = () => {
  const { theme, setTheme } = useTheme()
  const checked = theme === 'dark'
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={(v)=> setTheme(v ? 'dark' : 'light')} />
      Dark mode
    </label>
  )
}

