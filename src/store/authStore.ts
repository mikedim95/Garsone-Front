import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';

interface AuthStore {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      login: (user, token) => {
        const role = (user as any)?.role || 'guest'
        try { localStorage.setItem('ROLE', role); } catch {}
        try { window.dispatchEvent(new CustomEvent('role-changed', { detail: { role } })); } catch {}
        set({ user, token })
      },
      logout: () => {
        try { localStorage.setItem('ROLE', 'guest'); } catch {}
        try { window.dispatchEvent(new CustomEvent('role-changed', { detail: { role: 'guest' } })); } catch {}
        set({ user: null, token: null })
      },
      isAuthenticated: () => !!get().token,
    }),
    { name: 'auth-storage' }
  )
);
