import type { MenuItem } from '@/types';
import { Button } from '../ui/button';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
}

export const MenuItemCard = ({ item, onAdd }: Props) => {
  const { t } = useTranslation();
  const price =
    typeof item.price === 'number'
      ? item.price
      : typeof item.priceCents === 'number'
        ? item.priceCents / 100
        : 0;
  const currency = typeof window !== 'undefined' ? window.localStorage.getItem('CURRENCY') || 'EUR' : 'EUR';
  let priceText = `€${price.toFixed(2)}`;
  try {
    priceText = new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price);
  } catch (error) {
    console.warn('Failed to format price', error);
  }

  const displayName = item.name ?? item.title ?? t('menu.item', { defaultValue: 'Item' });
  const description = item.description ?? '';

  return (
    <div className="group relative rounded-2xl border border-border/60 bg-card/80 shadow-md hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
      <div className="aspect-[4/3] md:aspect-square overflow-hidden rounded-t-2xl">
        <img
          src={item.image}
          alt={displayName}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="p-4 sm:p-5">
        <h3 className="font-semibold text-lg mb-1">{displayName}</h3>
        <p className="text-sm text-muted-foreground mb-3 h-10 overflow-hidden">{description}</p>
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-primary">{priceText}</span>
          <Button
            size="icon"
            onClick={() => onAdd(item)}
            disabled={item.available === false}
            className="h-9 w-9 p-0 rounded-full shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
            aria-label={t('menu.add_to_cart')}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
