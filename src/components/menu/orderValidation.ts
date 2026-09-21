import type { CartItem, MenuItem, Modifier } from '../../types';

export const MAX_ITEM_QUANTITY = 999;

export function modifierSelectionCount(modifier: Modifier, selected: CartItem['selectedModifiers']) {
  const value = selected[modifier.id];
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return new Set(values.filter(id => modifier.options.some(option => option.id === id))).size;
}

export function modifierSelectionValid(modifier: Modifier, selected: CartItem['selectedModifiers']) {
  const count = modifierSelectionCount(modifier, selected);
  const minimum = Math.max(modifier.required ? 1 : 0, modifier.minSelect ?? 0);
  const maximum = modifier.maxSelect ?? Infinity;
  const value = selected[modifier.id];
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return count >= minimum && count <= maximum && values.every(id => modifier.options.some(option => option.id === id));
}

export function invalidCartItem(cart: CartItem[], menu: MenuItem[]): CartItem | undefined {
  return cart.find(entry => {
    const current = menu.find(item => item.id === entry.item.id);
    if (!current || current.available === false || current.isAvailable === false ||
        !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > MAX_ITEM_QUANTITY) return true;
    const modifiers = current.modifiers ?? [];
    return !modifiers.every(modifier => modifierSelectionValid(modifier, entry.selectedModifiers ?? {})) ||
      Object.keys(entry.selectedModifiers ?? {}).some(id => !modifiers.some(modifier => modifier.id === id));
  });
}
