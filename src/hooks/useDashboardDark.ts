import { useEffect, useState } from 'react';

const STORAGE_KEY = 'dashboardDark';

interface DashboardDarkEventDetail {
  value: boolean;
}

export const useDashboardDark = () => {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === '1';
  });

  useEffect(() => {
    const handler = () => setEnabled(localStorage.getItem(STORAGE_KEY) === '1');
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const set = (value: boolean) => {
    setEnabled(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch (error) {
      console.warn('Failed to persist dashboard dark preference', error);
    }
    try {
      window.dispatchEvent(
        new CustomEvent<DashboardDarkEventDetail>('dashboardDarkChanged', { detail: { value } })
      );
    } catch (error) {
      console.warn('Failed to dispatch dashboardDarkChanged event', error);
    }
  };

  return { dashboardDark: enabled, setDashboardDark: set };
};
