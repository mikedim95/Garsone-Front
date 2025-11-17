import { createContext, useContext } from 'react';

export interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const defaultAppContext: AppContextType = {
  sidebarOpen: false,
  toggleSidebar: () => {},
};

export const AppContext = createContext<AppContextType>(defaultAppContext);

export const useAppContext = () => useContext(AppContext);
