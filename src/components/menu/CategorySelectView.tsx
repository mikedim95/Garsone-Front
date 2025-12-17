import { motion, AnimatePresence } from 'framer-motion';
import type { MenuCategory } from '@/types';
import { useTranslation } from 'react-i18next';
import { ChefHat, Coffee, Salad, UtensilsCrossed, Wine, Cake, Soup, Sandwich, Pizza, IceCream } from 'lucide-react';

interface Props {
  categories: Array<Pick<MenuCategory, 'id' | 'title'>>;
  onSelect: (categoryId: string) => void;
  loading?: boolean;
  activeOrdersCount?: number;
  onShowActiveOrders?: () => void;
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  appetizer: Salad,
  appetizers: Salad,
  starter: Salad,
  starters: Salad,
  salad: Salad,
  salads: Salad,
  soup: Soup,
  soups: Soup,
  main: UtensilsCrossed,
  mains: UtensilsCrossed,
  entree: UtensilsCrossed,
  entrees: UtensilsCrossed,
  pizza: Pizza,
  pizzas: Pizza,
  burger: Sandwich,
  burgers: Sandwich,
  sandwich: Sandwich,
  sandwiches: Sandwich,
  drink: Coffee,
  drinks: Coffee,
  beverage: Coffee,
  beverages: Coffee,
  coffee: Coffee,
  wine: Wine,
  wines: Wine,
  cocktail: Wine,
  cocktails: Wine,
  dessert: Cake,
  desserts: Cake,
  sweet: IceCream,
  sweets: IceCream,
  ice: IceCream,
};

const getCategoryIcon = (title: string) => {
  const lower = title.toLowerCase();
  for (const [key, Icon] of Object.entries(categoryIcons)) {
    if (lower.includes(key)) return Icon;
  }
  return ChefHat;
};

const categoryGradients = [
  'from-primary/20 to-primary/5',
  'from-accent/20 to-accent/5',
  'from-secondary/30 to-secondary/10',
  'from-muted/40 to-muted/20',
  'from-primary/15 to-accent/10',
  'from-accent/15 to-primary/10',
];

export const CategorySelectView = ({ categories, onSelect, loading, activeOrdersCount = 0, onShowActiveOrders }: Props) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 px-4 py-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-3xl bg-muted/30 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="px-4 py-6"
    >
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-2xl font-bold text-center mb-8 text-foreground"
      >
        {t('menu.choose_category', { defaultValue: 'What are you craving?' })}
      </motion.h2>

      <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
        {categories.map((cat, idx) => {
          const Icon = getCategoryIcon(cat.title);
          const gradient = categoryGradients[idx % categoryGradients.length];

          return (
            <motion.button
              key={cat.id}
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1 + idx * 0.05, type: 'spring', stiffness: 300, damping: 25 }}
              whileHover={{ scale: 1.05, y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(cat.id)}
              className={`
                group relative aspect-square rounded-3xl 
                bg-gradient-to-br ${gradient}
                border border-border/40 backdrop-blur-sm
                shadow-lg hover:shadow-2xl hover:border-primary/40
                transition-all duration-300 overflow-hidden
                flex flex-col items-center justify-center gap-3 p-4
              `}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              <div className="relative z-10 w-14 h-14 rounded-2xl bg-background/60 backdrop-blur-sm flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:bg-primary/10 transition-all duration-300">
                <Icon className="h-7 w-7 text-primary group-hover:scale-110 transition-transform duration-300" />
              </div>
              
              <span className="relative z-10 text-sm font-semibold text-foreground text-center leading-tight line-clamp-2">
                {cat.title}
              </span>
              
              <div className="absolute -bottom-12 -right-12 w-24 h-24 rounded-full bg-primary/5 group-hover:bg-primary/10 transition-all duration-500" />
            </motion.button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        {activeOrdersCount > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + categories.length * 0.05 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onShowActiveOrders?.()}
            className="px-4 py-3 rounded-full border border-accent/60 text-accent bg-accent/10 backdrop-blur-sm text-sm font-medium hover:bg-accent/20 transition-all duration-300"
          >
            {t('menu.view_active_orders', { defaultValue: 'Active Orders' })}
            <span className="ml-2 inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-accent text-accent-foreground text-xs font-bold">
              {activeOrdersCount}
            </span>
          </motion.button>
        )}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 + categories.length * 0.05 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect('all')}
          className="px-8 py-3 rounded-full border border-border/60 bg-card/80 backdrop-blur-sm text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all duration-300"
        >
          {t('menu.view_all', { defaultValue: 'View Full Menu' })}
        </motion.button>
      </div>
    </motion.div>
  );
};
