import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { MenuItem, Modifier } from '@/types';

type SelectionMap = { [modifierId: string]: string };

interface Props {
  open: boolean;
  item: MenuItem | null;
  onClose: () => void;
  onConfirm: (selected: SelectionMap, quantity: number) => void;
  initialSelected?: SelectionMap;
  initialQty?: number;
}

const getModifierPriceDelta = (option: Modifier['options'][number]) => {
  if (typeof option.priceDelta === 'number') return option.priceDelta;
  if (typeof option.priceDeltaCents === 'number') return option.priceDeltaCents / 100;
  return 0;
};

export const ModifierDialog = ({ open, item, onClose, onConfirm, initialSelected, initialQty = 1 }: Props) => {
  const [selected, setSelected] = useState<SelectionMap>(initialSelected || {});
  const [qty, setQty] = useState<number>(initialQty || 1);
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

  useEffect(() => {
    setSelected(initialSelected || {});
    setQty(initialQty || 1);
  }, [initialSelected, initialQty, item?.id, open]);

  const effectiveModifiers: Modifier[] = useMemo(() => item?.modifiers || [], [item]);

  const canConfirm = useMemo(() => {
    if (!effectiveModifiers?.length) return true;
    return effectiveModifiers.every((m) => {
      const required = !!m.required || (m.minSelect ?? 0) > 0;
      if (!required) return true;
      return !!selected[m.id];
    });
  }, [effectiveModifiers, selected]);

  const handlePick = (modifierId: string, optionId: string) => {
    setSelected((prev) => ({ ...prev, [modifierId]: optionId }));
  };

  const handleConfirm = () => {
    onConfirm(selected, Math.max(1, qty));
    setSelected({});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {item ? `Customize: ${item.name}` : 'Customize'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
          {effectiveModifiers?.length ? (
            effectiveModifiers.map((mod) => (
              <div key={mod.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">
                    {mod.name}
                    {mod.required || (mod.minSelect ?? 0) > 0 ? (
                      <span className="ml-2 text-xs text-destructive">(required)</span>
                    ) : null}
                  </h4>
                </div>
                <RadioGroup
                  value={selected[mod.id]}
                  onValueChange={(val) => handlePick(mod.id, val)}
                  className="grid grid-cols-1 gap-2"
                >
                  {mod.options.map((opt) => {
                    const delta = getModifierPriceDelta(opt);
                    return (
                    <Label
                      key={opt.id}
                      htmlFor={`${mod.id}-${opt.id}`}
                      className="flex items-center gap-3 p-3 border rounded cursor-pointer"
                    >
                      <RadioGroupItem id={`${mod.id}-${opt.id}`} value={opt.id} />
                      <span className="flex-1">{opt.label}</span>
                      {delta !== 0 && (
                        <span className="text-sm text-muted-foreground">
                          {(delta > 0 ? '+' : '-') + formatCurrency(Math.abs(delta))}
                        </span>
                      )}
                    </Label>
                  )})}
                </RadioGroup>
              </div>
            ))
          ) : null}
        </div>

        <div className="flex items-center justify-center gap-3 py-2">
          <Button type="button" variant="outline" size="icon" onClick={() => setQty((v) => Math.max(1, v - 1))}>-</Button>
          <span className="text-lg font-semibold w-8 text-center">{qty}</span>
          <Button type="button" variant="outline" size="icon" onClick={() => setQty((v) => v + 1)}>+</Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>Add to cart</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};



