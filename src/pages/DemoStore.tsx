import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MenuItemCard } from '@/components/menu/MenuItemCard';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AppBurger } from './AppBurger';
import { HomeLink } from '@/components/HomeLink';
import { MENU_ITEMS } from '@/lib/menuData';
import { Button } from '@/components/ui/button';
import { MenuItem } from '@/types';
import { useToast } from '@/hooks/use-toast';

export default function DemoStore() {
  const { demoSlug } = useParams();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', ...Array.from(new Set(MENU_ITEMS.map((i) => i.category)))];
  const filteredItems = selectedCategory === 'All'
    ? MENU_ITEMS
    : MENU_ITEMS.filter((i) => i.category === selectedCategory);

  const handleAddItem = (item: MenuItem) => {
    toast({ title: 'Demo Mode', description: 'This is a read-only demo. Scan a real table QR to order!' });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AppBurger title={demoSlug?.replace('-', ' ').toUpperCase()} />
            <div>
              <h1 className="text-2xl font-bold text-purple-600">{demoSlug?.replace('-', ' ').toUpperCase()}</h1>
              <p className="text-sm text-amber-600 font-medium">🔒 Demo Mode - Read Only</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <HomeLink />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'outline'}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <MenuItemCard key={item.id} item={item} onAdd={handleAddItem} />
          ))}
        </div>
      </div>
    </div>
  );
}
