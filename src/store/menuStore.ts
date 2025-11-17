import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MenuData } from '@/types';

interface MenuState {
  data: MenuData | null;
  ts: number;
  setMenu: (data: MenuData) => void;
  clear: () => void;
}

export const useMenuStore = create<MenuState>()(
  persist(
    (set) => ({
      data: null,
      ts: 0,
      setMenu: (data) => set({ data, ts: Date.now() }),
      clear: () => set({ data: null, ts: 0 }),
    }),
    { name: 'menu-cache' }
  )
);

