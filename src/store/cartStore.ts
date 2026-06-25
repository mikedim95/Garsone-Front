import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CartItem } from '../types';

const getBaseItemPrice = (cartItem: CartItem) => {
  if (typeof cartItem.item.price === 'number') return cartItem.item.price;
  if (typeof cartItem.item.priceCents === 'number') return cartItem.item.priceCents / 100;
  return 0;
};

const getModifierOptionPriceDelta = (
  option: NonNullable<CartItem['item']['modifiers']>[number]['options'][number]
) => {
  if (typeof option.priceDelta === 'number') return option.priceDelta;
  if (typeof option.priceDeltaCents === 'number') return option.priceDeltaCents / 100;
  return 0;
};

const getSelectedModifiersTotal = (cartItem: CartItem) => {
  if (!cartItem.selectedModifiers) return 0;
  return Object.entries(cartItem.selectedModifiers).reduce((sum, [modifierId, optionIds]) => {
    const ids = Array.isArray(optionIds) ? optionIds : [optionIds];
    const modifierOptions = cartItem.item.modifiers?.find((modifier) => modifier.id === modifierId)?.options ?? [];
    return sum + ids.reduce((optionSum, optionId) => {
      const option = modifierOptions.find((opt) => opt.id === optionId);
      return optionSum + (option ? getModifierOptionPriceDelta(option) : 0);
    }, 0);
  }, 0);
};

const getCartItemUnitPrice = (cartItem: CartItem) =>
  getBaseItemPrice(cartItem) + getSelectedModifiersTotal(cartItem);

const mergeCartItems = (items: CartItem[]): CartItem[] => {
  const key = (ci: CartItem) =>
    ci.item.id + '|' + JSON.stringify(ci.selectedModifiers || {});
  const map = new Map<string, CartItem>();
  for (const ci of items) {
    const k = key(ci);
    const existing = map.get(k);
    if (existing) existing.quantity += ci.quantity;
    else map.set(k, { ...ci });
  }
  return Array.from(map.values());
};

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  setItems: (items: CartItem[]) => void;
  removeItem: (itemId: string) => void;
  removeItemAt: (index: number) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  updateQuantityAt: (index: number, quantity: number) => void;
  updateItemModifiers: (index: number, selectedModifiers: CartItem['selectedModifiers']) => void;
  updateItemAt: (index: number, patch: Partial<Pick<CartItem, 'quantity' | 'selectedModifiers'>>) => void;
  clearCart: () => void;
  getTotal: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      setItems: (items) => set({ items }),
      addItem: (newItem) =>
        set((state) => {
          const existing = state.items.find(
            (i) => i.item.id === newItem.item.id &&
              JSON.stringify(i.selectedModifiers) === JSON.stringify(newItem.selectedModifiers)
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i === existing ? { ...i, quantity: i.quantity + newItem.quantity } : i
              ),
            };
          }
          return { items: [...state.items, newItem] };
        }),
      removeItem: (itemId) =>
        set((state) => ({ items: state.items.filter((i) => i.item.id !== itemId) })),
      removeItemAt: (index) =>
        set((state) => ({ items: state.items.filter((_, i) => i !== index) })),
      updateQuantity: (itemId, quantity) =>
        set((state) => ({
          items: state.items.map((i) => (i.item.id === itemId ? { ...i, quantity } : i)),
        })),
      updateQuantityAt: (index, quantity) =>
        set((state) => ({
          items: state.items.map((i, currentIndex) =>
            currentIndex === index ? { ...i, quantity } : i
          ),
        })),
      updateItemModifiers: (index, selectedModifiers) =>
        set((state) => {
          const items = state.items.slice();
          if (!items[index]) return { items };
          items[index] = { ...items[index], selectedModifiers };
          return { items: mergeCartItems(items) };
        }),
      updateItemAt: (index, patch) =>
        set((state) => {
          const items = state.items.slice();
          if (!items[index]) return { items };
          items[index] = { ...items[index], ...patch };
          return { items: mergeCartItems(items) };
        }),
      clearCart: () => set({ items: [] }),
      getTotal: () => {
        const { items } = get();
        return items.reduce(
          (sum, cartItem) => sum + getCartItemUnitPrice(cartItem) * cartItem.quantity,
          0
        );
      },
    }),
    { name: 'cart-storage' }
  )
);
