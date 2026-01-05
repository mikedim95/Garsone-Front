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
    <div className="group relative rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
      {/* Full card image */}
      <div className="aspect-[4/3] md:aspect-square overflow-hidden">
        <img
          src={item.image}
          alt={displayName}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
      </div>
      
      {/* Premium gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
      
      {/* Content overlay at bottom */}
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        {/* Glass effect container */}
        <div className="relative">
          {/* Title with elegant typography */}
          <h3 className="font-semibold text-lg sm:text-xl text-white drop-shadow-lg tracking-tight leading-tight mb-1">
            {displayName}
          </h3>
          
          {/* Description - subtle and refined */}
          {description && (
            <p className="text-xs sm:text-sm text-white/70 line-clamp-2 mb-3 font-light">
              {description}
            </p>
          )}
          
          {/* Price and Add button row */}
          <div className="flex items-center justify-between mt-2">
            {/* Price with premium styling */}
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg tracking-tight">
                {priceText}
              </span>
            </div>
            
            {/* Sleek add button */}
            <Button
              size="icon"
              onClick={() => onAdd(item)}
              disabled={item.available === false}
              className="h-10 w-10 rounded-full shrink-0 bg-white/20 backdrop-blur-md border border-white/30 text-white hover:bg-white/30 hover:scale-110 transition-all duration-300 shadow-lg"
              aria-label={t('menu.add_to_cart')}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Subtle top shine effect */}
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/10 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </div>
  );
};
