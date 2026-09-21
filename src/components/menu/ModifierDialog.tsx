import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { MenuItem, Modifier } from '@/types';
import { useTranslation } from 'react-i18next';
import { useDashboardTheme } from '@/hooks/useDashboardDark';
import { MAX_ITEM_QUANTITY, modifierSelectionCount, modifierSelectionValid } from './orderValidation';

type SelectionMap = { [modifierId: string]: string | string[] };

interface Props {
  open: boolean;
  item: MenuItem | null;
  onClose: () => void;
  onConfirm: (selected: SelectionMap, quantity: number) => void;
  initialSelected?: SelectionMap;
  initialQty?: number;
  confirmLabel?: string;
  minQuantity?: number;
  onRemove?: () => void;
  removeLabel?: string;
  saving?: boolean;
}

const getModifierPriceDelta = (option: Modifier['options'][number]) => {
  if (typeof option.priceDelta === 'number') return option.priceDelta;
  if (typeof option.priceDeltaCents === 'number') return option.priceDeltaCents / 100;
  return 0;
};

export const ModifierDialog = ({
  open,
  item,
  onClose,
  onConfirm,
  initialSelected,
  initialQty = 1,
  confirmLabel,
  minQuantity = 1,
  onRemove,
  removeLabel,
  saving = false,
}: Props) => {
  const { t } = useTranslation();
  const { dashboardDark, themeClass } = useDashboardTheme();
  const portalThemeClass = `${themeClass}${dashboardDark ? ' dark' : ''}`;
  const [selected, setSelected] = useState<SelectionMap>(initialSelected || {});
  const [qty, setQty] = useState<number>(Math.max(minQuantity, initialQty));
  const [submitted, setSubmitted] = useState(false);
  const currency = typeof window !== 'undefined' ? window.localStorage.getItem('CURRENCY') || 'EUR' : 'EUR';
  const formatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency });
    } catch (error) {
      console.warn('Failed to create currency formatter', error);
      return null;
    }
  }, [currency]);
  const formatCurrency = (value: number) =>
    formatter ? formatter.format(value) : `€${value.toFixed(2)}`;
  const displayName = item?.displayName ?? item?.name ?? item?.title ?? t('menu.item', { defaultValue: 'Item' });
  const description = item?.displayDescription ?? item?.description ?? '';

  useEffect(() => {
    setSelected(initialSelected || {});
    setQty(Math.min(MAX_ITEM_QUANTITY, Math.max(minQuantity, Number.isFinite(initialQty) ? Math.trunc(initialQty) : 1)));
    setSubmitted(false);
  }, [initialSelected, initialQty, item?.id, minQuantity, open]);

  const effectiveModifiers: Modifier[] = useMemo(() => item?.modifiers || [], [item]);

  const canConfirm = useMemo(() => {
    if (qty === 0 || !effectiveModifiers?.length) return true;
    return effectiveModifiers.every((modifier) => modifierSelectionValid(modifier, selected));
  }, [effectiveModifiers, qty, selected]);

  const handlePick = (modifierId: string, optionId: string) => {
    setSelected((prev) => ({ ...prev, [modifierId]: optionId }));
  };

  const handleToggle = (modifierId: string, optionId: string, checked: boolean) => {
    setSelected((prev) => {
      const current = prev[modifierId];
      const values = Array.isArray(current) ? current : current ? [current] : [];
      const next = checked ? [...new Set([...values, optionId])] : values.filter((id) => id !== optionId);
      if (!next.length) {
        const { [modifierId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [modifierId]: next };
    });
  };

  const handleConfirm = () => {
    if (saving) return;
    if (!canConfirm) {
      setSubmitted(true);
      return;
    }
    onConfirm(selected, Math.max(minQuantity, qty));
    setSubmitted(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !saving ? onClose() : null)}>
      <DialogContent className={`${portalThemeClass} flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg [@media(orientation:landscape)_and_(max-height:500px)]:max-w-3xl`}>
        <DialogHeader className="shrink-0 border-b border-border/40 px-5 pb-4 pt-5 pr-14">
          <DialogTitle>
            {item ? displayName : t('menu.item', { defaultValue: 'Item' })}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
          <DialogDescription className={description ? "" : "sr-only"}>{description || t('menu.customize_item', { defaultValue: 'Choose your options and quantity.' })}</DialogDescription>
          {effectiveModifiers?.length ? (
            effectiveModifiers.map((mod) => {
              const currentValue = selected[mod.id];
              const missingRequired = submitted && qty > 0 && !modifierSelectionValid(mod, selected);
              const allowsMultiple = mod.maxSelect === null || (mod.maxSelect ?? 1) > 1;
              const selectedCount = modifierSelectionCount(mod, selected);
              const minimum = Math.max(mod.required ? 1 : 0, mod.minSelect ?? 0);

              return (
                <div key={mod.id} className="space-y-3">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <h4 className="min-w-0 break-words font-medium">{mod.name}</h4>
                    {missingRequired ? (
                      <span role="alert" className="text-xs font-medium text-destructive">
                        {t('menu.modifier_selection_error', { defaultValue: 'Check the number of selected options' })}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {mod.maxSelect == null
                      ? t('menu.modifier_minimum', { count: minimum, defaultValue: 'Choose at least {{count}}' })
                      : minimum === mod.maxSelect
                      ? t('menu.modifier_exactly', { count: minimum, defaultValue: 'Choose {{count}}' })
                      : t('menu.modifier_range', { min: minimum, max: mod.maxSelect, defaultValue: 'Choose {{min}}–{{max}}' })}
                  </p>

                  {allowsMultiple ? (
                    <div className="grid grid-cols-1 gap-2">
                      {mod.options.map((opt) => {
                        const delta = getModifierPriceDelta(opt);
                        const checked = Array.isArray(currentValue)
                          ? currentValue.includes(opt.id)
                          : currentValue === opt.id;
                        return (
                          <Label
                            key={opt.id}
                            htmlFor={`${mod.id}-${opt.id}`}
                            className="flex min-h-11 min-w-0 items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors hover:bg-muted/40 has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5"
                          >
                            <Checkbox
                              id={`${mod.id}-${opt.id}`}
                              checked={checked}
                              disabled={saving || (!checked && mod.maxSelect != null && selectedCount >= mod.maxSelect)}
                              onCheckedChange={(value) => handleToggle(mod.id, opt.id, value === true)}
                            />
                            <span className="min-w-0 flex-1 break-words leading-snug">{opt.label}</span>
                            {delta !== 0 && (
                              <span className="shrink-0 text-sm text-muted-foreground">
                                {(delta > 0 ? '+' : '-') + formatCurrency(Math.abs(delta))}
                              </span>
                            )}
                          </Label>
                        );
                      })}
                    </div>
                  ) : (
                    <RadioGroup
                      value={Array.isArray(currentValue) ? currentValue[0] : currentValue}
                      onValueChange={(val) => handlePick(mod.id, val)}
                      className="grid grid-cols-1 gap-2"
                      disabled={saving}
                    >
                      {mod.options.map((opt) => {
                        const delta = getModifierPriceDelta(opt);
                        return (
                          <Label
                            key={opt.id}
                            htmlFor={`${mod.id}-${opt.id}`}
                            className="flex min-h-11 min-w-0 items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors hover:bg-muted/40 has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5"
                          >
                            <RadioGroupItem id={`${mod.id}-${opt.id}`} value={opt.id} />
                            <span className="min-w-0 flex-1 break-words leading-snug">{opt.label}</span>
                            {delta !== 0 && (
                              <span className="shrink-0 text-sm text-muted-foreground">
                                {(delta > 0 ? '+' : '-') + formatCurrency(Math.abs(delta))}
                              </span>
                            )}
                          </Label>
                        );
                      })}
                    </RadioGroup>
                  )}
                  {minimum === 0 && selectedCount > 0 ? (
                    <Button type="button" variant="ghost" size="sm" disabled={saving}
                      onClick={() => setSelected(previous => { const next = { ...previous }; delete next[mod.id]; return next; })}>
                      {t('menu.clear_selection', { defaultValue: 'Clear selection' })}
                    </Button>
                  ) : null}
                </div>
              );
            })
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-center gap-4 border-t border-border/40 py-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-full"
            onClick={() => setQty((v) => Math.max(minQuantity, v - 1))}
            disabled={saving || qty <= minQuantity}
            aria-label={t('menu.decrease_quantity', { defaultValue: 'Decrease quantity' })}
          >
            -
          </Button>
          <span className="text-lg font-semibold w-8 text-center">{qty}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-full"
            onClick={() => setQty((v) => Math.min(MAX_ITEM_QUANTITY, v + 1))}
            disabled={saving || qty >= MAX_ITEM_QUANTITY}
            aria-label={t('menu.increase_quantity', { defaultValue: 'Increase quantity' })}
          >
            +
          </Button>
        </div>

        <DialogFooter className="shrink-0 flex-row flex-wrap px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 [&>button]:flex-1">
          {onRemove ? (
            <Button variant="destructive" onClick={onRemove} disabled={saving}>
              {removeLabel ?? t('menu.remove_item', { defaultValue: 'Cancel item' })}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {confirmLabel ?? t('menu.add_to_cart', { defaultValue: 'Add to cart' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};



