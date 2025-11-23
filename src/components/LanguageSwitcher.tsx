import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
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

  return (
    <div className={cn('flex items-center justify-between gap-3 text-xs', className)}>
      <span className="text-muted-foreground">
        Language:{' '}
        <span className="font-semibold text-foreground">
          {isEnglish ? 'EN' : 'EL'}
        </span>
      </span>
      <Switch
        checked={!isEnglish}
        onCheckedChange={toggleLanguage}
        aria-label="Toggle language"
      />
    </div>
  );
};
