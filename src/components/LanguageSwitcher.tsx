import { useTranslation } from 'react-i18next';
import { Button, type ButtonProps } from './ui/button';
import { Globe } from 'lucide-react';

type Props = {
  className?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
};

export const LanguageSwitcher = ({ className = '', variant = 'outline', size = 'sm' }: Props) => {
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

  return (
    <Button
      variant={variant}
      size={size}
      onClick={toggleLanguage}
      className={"gap-2 " + className}
    >
      <Globe className="h-4 w-4" />
      {i18n.language.toUpperCase()}
    </Button>
  );
};
