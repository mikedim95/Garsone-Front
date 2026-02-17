import { useMemo } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme, type Theme } from '@/components/theme-provider-context'
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export const ThemeToggle = () => {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const icon = useMemo(() => {
    if (theme === 'dark') return <Moon className="h-4 w-4" />
    if (theme === 'light') return <Sun className="h-4 w-4" />
    return <Monitor className="h-4 w-4" />
  }, [theme])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent/60 transition-colors">
          {icon}
          <span>{t('theme.label', { defaultValue: 'Theme' })}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t('theme.appearance', { defaultValue: 'Appearance' })}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={(value: Theme)=> setTheme(value)}>
          <DropdownMenuRadioItem value="light"><Sun className="h-4 w-4 mr-2"/> {t('theme.light', { defaultValue: 'Light' })}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon className="h-4 w-4 mr-2"/> {t('theme.dark', { defaultValue: 'Dark' })}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor className="h-4 w-4 mr-2"/> {t('theme.system', { defaultValue: 'System' })}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

