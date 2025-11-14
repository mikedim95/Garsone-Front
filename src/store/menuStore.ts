import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MenuState {
  data: any | null;
  ts: number; // epoch ms
  setMenu: (data: any) => void;
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

