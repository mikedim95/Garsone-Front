import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.fixed.json';
import el from './locales/el.fixed.json';

// Safely get language from localStorage
const getStoredLanguage = () => {
  try {
    return localStorage.getItem('language') || 'en';
  } catch {
    return 'en';
  }
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    el: { translation: el },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false, // Critical: prevents blank screen
  },
});

export default i18n;

