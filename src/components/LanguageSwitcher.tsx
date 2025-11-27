import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  // kept for backwards-compat, but no longer used for styling
  variant?: string;
  size?: string;
};

export const LanguageSwitcher = ({ className = '' }: Props) => {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'el' : 'en';
    i18n.changeLanguage(newLang);
    try {
      localStorage.setItem('language', newLang);
    } catch (e) {
      console.error('Failed to save language preference', e);
    }
  };

  const isEnglish = (i18n.language || 'en').startsWith('en');

  const nextLabel = isEnglish ? 'Switch to Greek' : 'Switch to English';
  const FlagIcon = isEnglish ? UkFlag : GreekFlag;

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-label={nextLabel}
      title={nextLabel}
      className={cn(
        'inline-flex items-center justify-center rounded-full border border-border/70 bg-card/80 text-lg leading-none h-10 w-10 shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        className
      )}
    >
      <FlagIcon />
    </button>
  );
};

const GreekFlag = () => (
  <svg viewBox="0 0 60 40" role="img" aria-hidden="true" className="h-6 w-8">
    <rect width="60" height="40" fill="#0d5eaf" />
    <g fill="#ffffff">
      <rect x="0" y="16" width="60" height="8" />
      <rect x="0" y="0" width="60" height="8" />
      <rect x="0" y="32" width="60" height="8" />
      <rect x="0" y="8" width="24" height="8" />
      <rect x="8" y="0" width="8" height="24" />
    </g>
  </svg>
);

const UkFlag = () => (
  <svg viewBox="0 0 60 40" role="img" aria-hidden="true" className="h-6 w-8">
    <rect width="60" height="40" fill="#012169" />
    <g fill="#ffffff">
      <polygon points="0,0 25,0 60,24 60,40 35,40 0,16" />
      <polygon points="60,0 35,0 0,24 0,40 25,40 60,16" />
      <rect x="24" width="12" height="40" />
      <rect y="14" width="60" height="12" />
    </g>
    <g fill="#c8102e">
      <polygon points="0,0 20,0 60,26.7 60,40 40,40 0,13.3" />
      <polygon points="60,0 40,0 0,26.7 0,40 20,40 60,13.3" />
      <rect x="26" width="8" height="40" />
      <rect y="16" width="60" height="8" />
    </g>
  </svg>
);
