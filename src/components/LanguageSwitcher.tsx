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
        'inline-flex items-center justify-center cursor-pointer transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded',
        className
      )}
    >
      <FlagIcon />
    </button>
  );
};

const GreekFlag = () => (
  <svg viewBox="0 0 27 18" role="img" aria-hidden="true" className="h-6 w-8 rounded-sm shadow-sm">
    {/* 9 horizontal stripes - alternating blue/white, starting with blue */}
    <rect width="27" height="2" y="0" fill="#0d5eaf" />
    <rect width="27" height="2" y="2" fill="#ffffff" />
    <rect width="27" height="2" y="4" fill="#0d5eaf" />
    <rect width="27" height="2" y="6" fill="#ffffff" />
    <rect width="27" height="2" y="8" fill="#0d5eaf" />
    <rect width="27" height="2" y="10" fill="#ffffff" />
    <rect width="27" height="2" y="12" fill="#0d5eaf" />
    <rect width="27" height="2" y="14" fill="#ffffff" />
    <rect width="27" height="2" y="16" fill="#0d5eaf" />
    {/* Canton - blue square with white cross */}
    <rect width="10" height="10" fill="#0d5eaf" />
    {/* White cross in canton */}
    <rect x="4" y="0" width="2" height="10" fill="#ffffff" />
    <rect x="0" y="4" width="10" height="2" fill="#ffffff" />
  </svg>
);

const UkFlag = () => (
  <svg viewBox="0 0 60 40" role="img" aria-hidden="true" className="h-6 w-8 rounded-sm shadow-sm">
    <rect width="60" height="40" fill="#012169" />
    {/* White diagonals */}
    <polygon fill="#fff" points="0,0 7,0 60,30 60,40 53,40 0,10" />
    <polygon fill="#fff" points="60,0 53,0 0,30 0,40 7,40 60,10" />
    {/* Red diagonals */}
    <polygon fill="#C8102E" points="0,0 3,0 60,33 60,40 57,40 0,7" />
    <polygon fill="#C8102E" points="60,0 57,0 0,33 0,40 3,40 60,7" />
    {/* White cross */}
    <rect x="24" width="12" height="40" fill="#fff" />
    <rect y="14" width="60" height="12" fill="#fff" />
    {/* Red cross */}
    <rect x="26" width="8" height="40" fill="#C8102E" />
    <rect y="16" width="60" height="8" fill="#C8102E" />
  </svg>
);
