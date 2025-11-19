import { useState } from 'react';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const navLinkClass =
  'text-sm font-semibold tracking-tight text-foreground/85 hover:text-foreground transition-colors focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none';

export const Navigation = () => {
  const { t } = useTranslation();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/60 bg-card/85 dark:bg-background/80 backdrop-blur-xl shadow-lg supports-[backdrop-filter]:bg-card/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16 gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-primary shadow-lg">
              <span className="text-primary-foreground font-black text-lg">G</span>
            </div>
            <span className="text-xl font-black bg-gradient-primary bg-clip-text text-transparent">
              Garsone
            </span>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-4 sm:gap-6 flex-1">
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
              <a href="#demo-qr">{t('nav.demo', { defaultValue: 'Demo' })}</a>
            </Button>

            <Button asChild variant="ghost" className={navLinkClass}>
              <a href="/login">{t('nav.login', { defaultValue: 'Login' })}</a>
            </Button>
          </div>

          {/* Right side - Theme + Language (desktop) */}
          <div className="hidden md:flex items-center gap-2 ml-auto">
            <ThemeToggle />
            <LanguageSwitcher
              className="bg-card text-foreground border-border shadow-sm hover:bg-card focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
              variant="outline"
            />
          </div>

          {/* Mobile burger with navbar items + toggles */}
          <div className="flex md:hidden items-center gap-2 ml-auto">
            <LandingMobileMenu />
          </div>
        </div>
      </div>
    </nav>
  );
};

const LandingMobileMenu = () => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="relative inline-flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-lg border border-border/60 bg-card/80 hover:bg-accent transition-colors duration-150"
          aria-label={t('menu.title', { defaultValue: 'Open menu' })}
        >
          <span
            className={`block w-5 h-0.5 bg-foreground rounded absolute transition-transform duration-200 ${
              open ? 'rotate-45' : '-translate-y-1'
            }`}
          />
          <span
            className={`block w-5 h-0.5 bg-foreground rounded absolute transition-opacity duration-200 ${
              open ? 'opacity-0' : 'opacity-100'
            }`}
          />
          <span
            className={`block w-5 h-0.5 bg-foreground rounded absolute transition-transform duration-200 ${
              open ? '-rotate-45' : 'translate-y-1'
            }`}
          />
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[80vw] max-w-xs sm:max-w-sm flex flex-col bg-background text-foreground"
      >
        <SheetHeader>
          <SheetTitle className="text-base font-semibold">
            {t('menu.title', { defaultValue: 'Menu' })}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              {t('app.navigation', { defaultValue: 'Navigation' })}
            </h3>
            <Button
              variant="ghost"
              className="w-full justify-start text-sm font-medium"
              type="button"
            >
              {t('nav.solutions', { defaultValue: 'Solutions' })}
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start text-sm font-medium"
              type="button"
            >
              {t('nav.resources', { defaultValue: 'Resources' })}
            </Button>
            <Button
              asChild
              variant="ghost"
              className="w-full justify-start text-sm font-medium"
            >
              <a href="#demo-qr" onClick={() => setOpen(false)}>
                {t('nav.demo', { defaultValue: 'Demo' })}
              </a>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="w-full justify-start text-sm font-medium"
            >
              <a href="/login" onClick={() => setOpen(false)}>
                {t('nav.login', { defaultValue: 'Login' })}
              </a>
            </Button>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              {t('app.preferences', { defaultValue: 'Preferences' })}
            </h3>
            <div className="flex flex-col gap-2">
              <ThemeToggle />
              <LanguageSwitcher
                className="bg-card text-foreground border-border shadow-sm hover:bg-card focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                variant="outline"
              />
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
};
