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
        const role = user.role ?? 'guest';
        const storeSlug = typeof user.storeSlug === 'string' ? user.storeSlug : undefined;
        try {
          localStorage.setItem('ROLE', role);
          if (storeSlug) {
            localStorage.setItem('STORE_SLUG', storeSlug);
          }
        } catch (error) {
          console.warn('Failed to persist role', error);
        }
        if (typeof window !== 'undefined') {
          try {
            window.dispatchEvent(new CustomEvent('role-changed', { detail: { role } }));
          } catch (error) {
            console.warn('Failed to dispatch role change event', error);
          }
        }
        set({ user, token });
      },
      logout: () => {
        try {
          localStorage.setItem('ROLE', 'guest');
          localStorage.removeItem('STORE_SLUG');
        } catch (error) {
          console.warn('Failed to reset stored role', error);
        }
        if (typeof window !== 'undefined') {
          try {
            window.dispatchEvent(new CustomEvent('role-changed', { detail: { role: 'guest' } }));
          } catch (error) {
            console.warn('Failed to dispatch logout role change event', error);
          }
        }
        set({ user: null, token: null });
      },
      isAuthenticated: () => !!get().token,
    }),
    { name: 'auth-storage' }
  )
);
