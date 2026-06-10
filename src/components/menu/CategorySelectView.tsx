import type { MenuCategory } from '@/types';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  categories: Array<Pick<MenuCategory, 'id' | 'title' | 'imageUrl'>>;
  onSelect: (categoryId: string) => void;
  loading?: boolean;
  variant?: 'default' | 'noor';
  footer?: ReactNode;
}

const categoryGradients = [
  'from-primary/20 to-primary/5',
  'from-accent/20 to-accent/5',
  'from-secondary/30 to-secondary/10',
  'from-muted/40 to-muted/20',
  'from-primary/15 to-accent/10',
  'from-accent/15 to-primary/10',
];

export const CategorySelectView = ({ categories, onSelect, loading, variant = 'default', footer }: Props) => {
  const { t } = useTranslation();
  const isNoor = variant === 'noor';

  const getNoorGradient = (idx: number) =>
    idx % 2 === 0
      ? 'from-fuchsia-500/25 via-fuchsia-900/15 to-black/55'
      : 'from-rose-500/25 via-rose-950/20 to-black/55';

  if (loading) {
    return (
      <div className={isNoor ? "px-2 py-6" : "px-4 py-6"}>
        <h2 className={isNoor ? "text-2xl font-extrabold text-center mb-8 text-white" : "text-2xl font-bold text-center mb-8 text-foreground"}>
          {t('menu.choose_category', { defaultValue: 'What are you craving?' })}
        </h2>

        <div className={isNoor ? "grid grid-cols-2 gap-4 max-w-xl mx-auto" : "grid grid-cols-2 gap-4 max-w-lg mx-auto"}>
          {Array.from({ length: isNoor ? 4 : 6 }).map((_, idx) => {
            const gradient = isNoor ? getNoorGradient(idx) : categoryGradients[idx % categoryGradients.length];
            return (
              <div
                key={`cat-skeleton-${idx}`}
                className={`
                  relative aspect-square ${isNoor ? 'rounded-[22px]' : 'rounded-3xl'}
                  bg-gradient-to-br ${gradient}
                  border ${isNoor ? 'border-white/10' : 'border-border/40'} backdrop-blur-sm
                  shadow-lg overflow-hidden
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
    <div className={isNoor ? "relative px-2 py-6" : "px-4 py-6"}>
      {isNoor && (
        <>
          <div className="pointer-events-none absolute -left-20 top-10 h-48 w-48 rounded-full bg-fuchsia-700/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-16 bottom-0 h-40 w-40 rounded-full bg-purple-700/20 blur-3xl" />
        </>
      )}
      <h2 className={isNoor ? "relative text-2xl font-extrabold text-center mb-8 text-white" : "text-2xl font-bold text-center mb-8 text-foreground"}>
        {t('menu.choose_category', { defaultValue: 'What are you craving?' })}
      </h2>

      <div className={isNoor ? "relative grid grid-cols-2 gap-4 max-w-xl mx-auto" : "grid grid-cols-2 gap-4 max-w-lg mx-auto"}>
        {categories.map((cat, idx) => {
          const gradient = isNoor ? getNoorGradient(idx) : categoryGradients[idx % categoryGradients.length];
          const imageUrl = cat.imageUrl?.trim();

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat.id)}
              className={`
                group relative aspect-square ${isNoor ? 'rounded-[22px]' : 'rounded-3xl'}
                bg-gradient-to-br ${gradient}
                border ${isNoor ? 'border-white/10' : 'border-border/40'} backdrop-blur-sm
                ${isNoor ? 'shadow-[0_18px_45px_rgba(0,0,0,0.28)] hover:border-fuchsia-400/40' : 'shadow-lg hover:shadow-2xl hover:border-primary/40'}
                transition-all duration-300 overflow-hidden
                flex flex-col items-center justify-end gap-3 p-4
              `}
            >
              {imageUrl ? (
                <>
                  <img
                    src={imageUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full scale-110 object-cover blur-sm transition-transform duration-500 group-hover:scale-125"
                    loading={idx < 4 ? 'eager' : 'lazy'}
                  />
                  <img
                    src={imageUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-75 transition-transform duration-500 group-hover:scale-105"
                    loading={idx < 4 ? 'eager' : 'lazy'}
                  />
                </>
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-transparent to-background/10" />
              )}

              <div className={isNoor ? "absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent transition-opacity duration-300" : "absolute inset-0 bg-gradient-to-t from-background/90 via-background/35 to-transparent transition-opacity duration-300 group-hover:from-background/80"} />
              
              <span className={isNoor ? "relative z-10 text-sm font-bold text-white text-center leading-tight line-clamp-2" : "relative z-10 text-sm font-semibold text-foreground text-center leading-tight line-clamp-2"}>
                {cat.title}
              </span>

              {!imageUrl && (
                <div className={isNoor ? "absolute -bottom-12 -right-12 w-24 h-24 rounded-full bg-fuchsia-500/10 group-hover:bg-fuchsia-500/20 transition-all duration-500" : "absolute -bottom-12 -right-12 w-24 h-24 rounded-full bg-primary/5 group-hover:bg-primary/10 transition-all duration-500"} />
              )}
            </button>
          );
        })}
      </div>
      {footer ? <div className="mt-8">{footer}</div> : null}
    </div>
  );
};
