import { LanguageSwitcher } from '../LanguageSwitcher';
import { AppBurger } from '@/pages/AppBurger';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const navLinkClass =
  'text-sm font-semibold tracking-tight text-foreground/85 hover:text-foreground transition-colors focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none';

export const Navigation = () => {
  const { t } = useTranslation();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/60 bg-card/85 dark:bg-background/80 backdrop-blur-xl shadow-lg supports-[backdrop-filter]:bg-card/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-8">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-primary shadow-lg">
              <span className="text-primary-foreground font-black text-lg">G</span>
            </div>
            <span className="text-xl font-black bg-gradient-primary bg-clip-text text-transparent">
              Garsone
            </span>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-6 flex-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className={navLinkClass}>
                  {t('nav.solutions', { defaultValue: 'Solutions' })}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border border-border/50 bg-card/95 dark:bg-background/95 shadow-2xl backdrop-blur-xl">
                <DropdownMenuItem className="font-medium text-foreground/85 focus:text-foreground focus:bg-accent/20">
                  {t('nav.solutions_restaurants', { defaultValue: 'For Restaurants' })}
                </DropdownMenuItem>
                <DropdownMenuItem className="font-medium text-foreground/85 focus:text-foreground focus:bg-accent/20">
                  {t('nav.solutions_cafes', { defaultValue: 'For Cafes' })}
                </DropdownMenuItem>
                <DropdownMenuItem className="font-medium text-foreground/85 focus:text-foreground focus:bg-accent/20">
                  {t('nav.solutions_bars', { defaultValue: 'For Bars' })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className={navLinkClass}>
                  {t('nav.resources', { defaultValue: 'Resources' })}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border border-border/50 bg-card/95 dark:bg-background/95 shadow-2xl backdrop-blur-xl">
                <DropdownMenuItem className="font-medium text-foreground/85 focus:text-foreground focus:bg-accent/20">
                  {t('nav.resources_docs', { defaultValue: 'Documentation' })}
                </DropdownMenuItem>
                <DropdownMenuItem className="font-medium text-foreground/85 focus:text-foreground focus:bg-accent/20">
                  {t('nav.resources_api', { defaultValue: 'API Reference' })}
                </DropdownMenuItem>
                <DropdownMenuItem className="font-medium text-foreground/85 focus:text-foreground focus:bg-accent/20">
                  {t('nav.resources_support', { defaultValue: 'Support' })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button asChild variant="ghost" className={navLinkClass}>
              <a href="#demo-qr">{t('nav.demo')}</a>
            </Button>

            <Button asChild variant="ghost" className={navLinkClass}>
              <a href="/login">{t('nav.login')}</a>
            </Button>
          </div>

          {/* Right side - Status and Language */}
          <div className="hidden md:flex items-center gap-3 ml-auto"> 
            <LanguageSwitcher className="bg-card text-foreground border-border shadow-sm hover:bg-card" variant="outline" />
          </div>

          {/* Mobile Menu (match dashboards' AppBurger) */}
          <div className="md:hidden flex items-center gap-2 ml-auto"> 
            <LanguageSwitcher className="bg-card text-foreground border-border shadow-sm hover:bg-card" variant="outline" />
            <AppBurger title={t('menu.title')} />
          </div>
        </div>
      </div>
    </nav>
  );
};
