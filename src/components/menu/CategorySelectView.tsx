import type { MenuCategory } from '@/types';
import { useTranslation } from 'react-i18next';
import { ChefHat, Coffee, Salad, UtensilsCrossed, Wine, Cake, Soup, Sandwich, Pizza, IceCream } from 'lucide-react';

interface Props {
  categories: Array<Pick<MenuCategory, 'id' | 'title'>>;
  onSelect: (categoryId: string) => void;
  loading?: boolean;
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

export const CategorySelectView = ({ categories, onSelect, loading }: Props) => {
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
    <div className="px-4 py-6">
      <h2 className="text-2xl font-bold text-center mb-8 text-foreground">
        {t('menu.choose_category', { defaultValue: 'What are you craving?' })}
      </h2>

      <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
        {categories.map((cat, idx) => {
          const Icon = getCategoryIcon(cat.title);
          const gradient = categoryGradients[idx % categoryGradients.length];

          return (
            <button
              key={cat.id}
              type="button"
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
            </button>
          );
        })}
      </div>
    </div>
  );
};
