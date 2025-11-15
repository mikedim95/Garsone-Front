import { Menu } from 'lucide-react';
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

export const Navigation = () => {
  const { t } = useTranslation();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10 text-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-8">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 shadow-lg">
              <span className="text-white font-black text-lg">OF</span>
            </div>
            <span className="text-xl font-black bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              OrderFlow
            </span>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-6 flex-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="text-sm font-medium text-gray-900">
                  Solutions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="glass-dark border-white/10">
                <DropdownMenuItem>For Restaurants</DropdownMenuItem>
                <DropdownMenuItem>For Cafes</DropdownMenuItem>
                <DropdownMenuItem>For Bars</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="text-sm font-medium text-gray-900">
                  Resources
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="glass-dark border-white/10">
                <DropdownMenuItem>Documentation</DropdownMenuItem>
                <DropdownMenuItem>API Reference</DropdownMenuItem>
                <DropdownMenuItem>Support</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button asChild variant="ghost" className="text-sm font-medium text-gray-900">
              <a href="#demo-qr">{t('nav.demo')}</a>
            </Button>

            <Button asChild variant="ghost" className="text-sm font-medium text-gray-900">
              <a href="/login">{t('nav.login')}</a>
            </Button>
          </div>

          {/* Right side - Status and Language */}
          <div className="hidden md:flex items-center gap-3 ml-auto"> 
            <LanguageSwitcher className="bg-white text-gray-900 border-gray-200 shadow-sm hover:bg-white" variant="outline" />
          </div>

          {/* Mobile Menu (match dashboards' AppBurger) */}
          <div className="md:hidden flex items-center gap-2 ml-auto"> 
            <LanguageSwitcher className="bg-white text-gray-900 border-gray-200 shadow-sm hover:bg-white" variant="outline" />
            <AppBurger title={t('menu.title')} />
          </div>
        </div>
      </div>
    </nav>
  );
};
