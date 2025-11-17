import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/components/theme-provider-context';

const THEME_KEY = 'dashboardTheme';
const EVENT_NAME = 'dashboardThemeEvent';

export type DashboardTheme =
  | 'classic'
  | 'luxe-ember'
  | 'nocturne-marina'
  | 'modern-mist'
  | 'velvet-dusk';

type DashboardThemeOption = {
  value: DashboardTheme;
  label: string;
  subtitle: string;
  preview: [string, string];
};

export const dashboardThemeOptions: DashboardThemeOption[] = [
  {
    value: 'classic',
    label: 'Garsoné Classic',
    subtitle: 'Violet primary + neutral surfaces',
    preview: ['#7a5bff', '#0f172a'],
  },
  {
    value: 'luxe-ember',
    label: 'Luxe Ember',
    subtitle: 'Copper warmth with obsidian dark',
    preview: ['#d98f4a', '#151828'],
  },
  {
    value: 'nocturne-marina',
    label: 'Nocturne Marina',
    subtitle: 'Deep navy & teal gradients',
    preview: ['#1c2b4a', '#2782a6'],
  },
  {
    value: 'modern-mist',
    label: 'Modern Mist',
    subtitle: 'Soft neutrals with sand copper',
    preview: ['#edf1f8', '#f5a05f'],
  },
  {
    value: 'velvet-dusk',
    label: 'Velvet Dusk',
    subtitle: 'Rose gold layered on midnight',
    preview: ['#f3c9b8', '#1b1f32'],
  },
];

export const dashboardThemeClassNames = dashboardThemeOptions
  .filter((option) => option.value !== 'classic')
  .map((option) => `theme-${option.value}`);

interface DashboardThemeEventDetail {
  theme?: DashboardTheme;
}

const readTheme = (): DashboardTheme => {
  if (typeof window === 'undefined') return 'modern-mist';
  const stored = localStorage.getItem(THEME_KEY) as DashboardTheme | null;
  return stored ?? 'modern-mist';
};

const broadcast = (detail: DashboardThemeEventDetail) => {
  try {
    window.dispatchEvent(new CustomEvent<DashboardThemeEventDetail>(EVENT_NAME, { detail }));
  } catch (error) {
    console.warn('Failed to dispatch dashboard theme event', error);
  }
};

const getSystemPrefersDark = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const useSystemPrefersDark = () => {
  const [prefersDark, setPrefersDark] = useState<boolean>(() => getSystemPrefersDark());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    setPrefersDark(media.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return prefersDark;
};

export const useDashboardTheme = () => {
  const { theme, setTheme } = useTheme();
  const systemPrefersDark = useSystemPrefersDark();
  const [dashboardTheme, setThemeState] = useState<DashboardTheme>(() => readTheme());

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY) {
        setThemeState(readTheme());
      }
    };
    const handleEvent = (event: Event) => {
      const detail = (event as CustomEvent<DashboardThemeEventDetail>).detail;
      if (detail.theme) {
        setThemeState(detail.theme);
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(EVENT_NAME, handleEvent as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(EVENT_NAME, handleEvent as EventListener);
    };
  }, []);

  const dashboardDark = useMemo(() => {
    if (theme === 'system') {
      return systemPrefersDark;
    }
    return theme === 'dark';
  }, [systemPrefersDark, theme]);

  const setDashboardDark = (value: boolean) => {
    setTheme(value ? 'dark' : 'light');
  };

  const setDashboardTheme = (value: DashboardTheme) => {
    setThemeState(value);
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch (error) {
      console.warn('Failed to persist dashboard theme preference', error);
    }
    broadcast({ theme: value });
  };

  const themeClass = dashboardTheme === 'classic' ? '' : `theme-${dashboardTheme}`;

  return { dashboardDark, setDashboardDark, dashboardTheme, setDashboardTheme, themeClass };
};

export const useDashboardDark = useDashboardTheme;
