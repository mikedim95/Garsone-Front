import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'

const STORAGE_KEY = 'dashboardDark'

export function useDashboardDark() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY) === '1'
  })

  useEffect(() => {
    const handler = () => setEnabled(localStorage.getItem(STORAGE_KEY) === '1')
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const set = (v: boolean) => {
    setEnabled(v)
    localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
    try { window.dispatchEvent(new CustomEvent('dashboardDarkChanged', { detail: { value: v } })) } catch {}
  }

  return { dashboardDark: enabled, setDashboardDark: set }
}

export const DashboardThemeToggle = () => {
  const { dashboardDark, setDashboardDark } = useDashboardDark()
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <Switch checked={dashboardDark} onCheckedChange={(v)=> setDashboardDark(Boolean(v))} />
      Dark dashboards
    </label>
  )
}
