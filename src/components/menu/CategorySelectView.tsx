import type { MenuCategory } from '@/types';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, useReducedMotion } from 'framer-motion';

interface Props {
  categories: Array<Pick<MenuCategory, 'id' | 'title' | 'imageUrl'>>;
  onSelect: (categoryId: string) => void;
  loading?: boolean;
  variant?: 'default' | 'noor';
}

const categoryGradients = [
  'from-primary/20 to-primary/5',
  'from-accent/20 to-accent/5',
  'from-secondary/30 to-secondary/10',
  'from-muted/40 to-muted/20',
  'from-primary/15 to-accent/10',
  'from-accent/15 to-primary/10',
];

export const CategorySelectView = ({ categories, onSelect, loading, variant = 'default' }: Props) => {
  const { t } = useTranslation();
  const isNoor = variant === 'noor';
  const reduceMotion = useReducedMotion();

  const getNoorGradient = (idx: number) =>
    idx % 2 === 0
      ? 'from-fuchsia-500/25 via-fuchsia-900/15 to-black/55'
      : 'from-rose-500/25 via-rose-950/20 to-black/55';

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-2 sm:py-3" role="status" aria-busy="true">
        <h2 className="mb-5 text-center text-xl font-bold leading-snug text-foreground sm:mb-6 sm:text-2xl">
          {t('menu.choose_category', { defaultValue: 'What are you craving?' })}
        </h2>

        <div className="mx-auto grid max-w-xl grid-cols-2 gap-3 sm:gap-4">
          {Array.from({ length: isNoor ? 4 : 6 }).map((_, idx) => {
            const gradient = isNoor ? getNoorGradient(idx) : categoryGradients[idx % categoryGradients.length];
            return (
              <div
                key={`cat-skeleton-${idx}`}
                className={`
                  relative aspect-[6/5] rounded-2xl sm:aspect-square sm:rounded-3xl
                  bg-gradient-to-br ${gradient}
                  border ${isNoor ? 'border-white/10' : 'border-border/40'} backdrop-blur-sm
                  shadow-sm overflow-hidden
                  flex flex-col items-center justify-end gap-3 p-4
                `}
              >
                <div className={isNoor ? "absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" : "absolute inset-0 bg-gradient-to-t from-background/20 to-transparent"} />

                <Skeleton className={isNoor ? "relative z-10 h-5 w-24 rounded-full bg-black/35" : "relative z-10 h-5 w-24 rounded-full bg-background/55"} />

                <div className={isNoor ? "absolute -bottom-12 -right-12 w-24 h-24 rounded-full bg-fuchsia-500/10" : "absolute -bottom-12 -right-12 w-24 h-24 rounded-full bg-primary/5"} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className="relative mx-auto max-w-2xl py-2 sm:py-3" aria-labelledby="menu-category-heading" data-testid="category-selection">
      {isNoor && (
        <>
          <div className="pointer-events-none absolute inset-x-5 top-10 h-40 rounded-full bg-primary/5 blur-3xl" />
        </>
      )}
      <h2 id="menu-category-heading" className="relative mb-5 text-center text-xl font-bold leading-snug text-foreground sm:mb-6 sm:text-2xl">
        {t('menu.choose_category', { defaultValue: 'What are you craving?' })}
      </h2>

      <div className="relative mx-auto grid max-w-xl grid-cols-2 gap-3 sm:gap-4">
        {categories.map((cat, idx) => {
          const gradient = isNoor ? getNoorGradient(idx) : categoryGradients[idx % categoryGradients.length];
          const imageUrl = cat.imageUrl?.trim();

          return (
            <motion.button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat.id)}
              aria-label={cat.title}
              title={cat.title}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98, transition: { duration: 0.1, delay: 0 } }}
              transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : Math.min(idx * 0.025, 0.12), ease: 'easeOut' }}
              className={`
                group relative min-w-0 aspect-[6/5] rounded-2xl sm:aspect-square sm:rounded-3xl
                bg-gradient-to-br ${gradient}
                border ${isNoor ? 'border-white/10' : 'border-border/40'} backdrop-blur-sm
                ${isNoor ? 'shadow-md hover:border-fuchsia-400/40' : 'shadow-sm hover:shadow-md hover:border-primary/40'}
                transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none overflow-hidden
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
                flex flex-col items-center justify-end gap-3 p-3 sm:p-4
              `}
            >
              {imageUrl ? (
                <>
                  <img
                    src={imageUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-85 transition-transform duration-300 motion-reduce:transition-none motion-safe:group-hover:scale-[1.03]"
                    loading={idx < 4 ? 'eager' : 'lazy'}
                    decoding="async"
                  />
                </>
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-transparent to-background/10" />
              )}

              <div className={isNoor ? "absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent transition-opacity duration-300" : "absolute inset-0 bg-gradient-to-t from-background/90 via-background/35 to-transparent transition-opacity duration-300 group-hover:from-background/80"} />
              
              <span className={isNoor ? "relative z-10 w-full text-sm font-bold text-white text-center leading-snug break-words [overflow-wrap:anywhere] line-clamp-3 sm:text-base" : "relative z-10 w-full text-sm font-semibold text-foreground text-center leading-snug break-words [overflow-wrap:anywhere] line-clamp-3 sm:text-base"}>
                {cat.title}
              </span>

              {!imageUrl && (
                <div className={isNoor ? "absolute -bottom-12 -right-12 w-24 h-24 rounded-full bg-fuchsia-500/10 group-hover:bg-fuchsia-500/20 transition-all duration-500" : "absolute -bottom-12 -right-12 w-24 h-24 rounded-full bg-primary/5 group-hover:bg-primary/10 transition-all duration-500"} />
              )}
            </motion.button>
          );
        })}
      </div>
    </section>
  );
};
