import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import el from './locales/el.json';

const DEFAULT_LANGUAGE = 'el' as const;
const SUPPORTED_LANGUAGES = ['en', 'el'] as const;

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const normalizeLanguage = (
  value: string | null | undefined
): SupportedLanguage => {
  const lang = (value || '').trim().toLowerCase();
  if (lang.startsWith('en')) return 'en';
  if (lang.startsWith('el')) return 'el';
  return DEFAULT_LANGUAGE;
};

// Safely get language from localStorage. Default to Greek on first start.
const getStoredLanguage = (): SupportedLanguage => {
  try {
    return normalizeLanguage(localStorage.getItem('language'));
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    el: { translation: el },
  },
  lng: getStoredLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  nonExplicitSupportedLngs: true,
  load: 'languageOnly',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false, // Critical: prevents blank screen
  },
});

export default i18n;
