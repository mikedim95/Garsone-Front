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


type ThemePreview = {
  light: [string, string]; // [primary, background]
  dark: [string, string];  // [primary, background]
};

type DashboardThemeOption = {
  value: DashboardTheme;
  label: string;
  subtitle: string;
  preview: ThemePreview;
};

export const dashboardThemeOptions: DashboardThemeOption[] = [
  {
    value: 'classic',
    label: 'Garsoné Classic',
    subtitle: 'Violet & cyan modern look',
    preview: {
      light: ['#8b5cf6', '#faf9f7'],
      dark: ['#38bdf8', '#0f172a'],
    },
  },
  {
    value: 'luxe-ember',
    label: 'Luxe Ember',
    subtitle: 'Warm copper & gold accents',
    preview: {
      light: ['#d97706', '#fdf6ed'],
      dark: ['#fbbf24', '#1c0c08'],
    },
  },
  {
    value: 'nocturne-marina',
    label: 'Nocturne Marina',
    subtitle: 'Ocean teal & deep navy',
    preview: {
      light: ['#0891b2', '#f0f9ff'],
      dark: ['#22d3ee', '#0a1628'],
    },
  },
  {
    value: 'modern-mist',
    label: 'Modern Mist',
    subtitle: 'Soft violet & electric pink',
    preview: {
      light: ['#a855f7', '#faf5ff'],
      dark: ['#e879f9', '#1a0a1e'],
    },
  },
  {
    value: 'velvet-dusk',
    label: 'Velvet Dusk',
    subtitle: 'Forest green & warm gold',
    preview: {
      light: ['#16a34a', '#f9faf5'],
      dark: ['#facc15', '#0a1a0d'],
    },
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
