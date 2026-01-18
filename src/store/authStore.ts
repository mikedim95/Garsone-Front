import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User } from '../types';
import { setStoredStoreSlug, clearStoredStoreSlug } from '@/lib/storeSlug';

interface AuthStore {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
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
            setStoredStoreSlug(storeSlug);
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
          clearStoredStoreSlug();
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
      updateUser: (updates) => {
        set((state) => {
          if (!state.user) return state;
          const nextUser = { ...state.user, ...updates };
          try {
            if (nextUser.role) {
              localStorage.setItem('ROLE', nextUser.role);
            }
            if (nextUser.storeSlug) {
              setStoredStoreSlug(nextUser.storeSlug);
            }
          } catch (error) {
            console.warn('Failed to persist user updates', error);
          }
          return { ...state, user: nextUser };
        });
      },
      isAuthenticated: () => !!get().token,
    }),
    {
      name: 'auth-storage',
      // Use per-tab session storage so running multiple roles (cook/waiter/manager) in different tabs
      // doesn't clobber each other's tokens and force surprise logouts.
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
