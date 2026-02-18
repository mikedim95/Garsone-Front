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
  return Object.entries(cartItem.selectedModifiers).reduce((sum, [modifierId, optionId]) => {
    const option = cartItem.item.modifiers
      ?.find((modifier) => modifier.id === modifierId)
      ?.options.find((opt) => opt.id === optionId);
    return sum + (option ? getModifierOptionPriceDelta(option) : 0);
  }, 0);
};

const getCartItemUnitPrice = (cartItem: CartItem) =>
  getBaseItemPrice(cartItem) + getSelectedModifiersTotal(cartItem);

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  setItems: (items: CartItem[]) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  updateItemModifiers: (index: number, selectedModifiers: { [modifierId: string]: string }) => void;
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
      updateQuantity: (itemId, quantity) =>
        set((state) => ({
          items: state.items.map((i) => (i.item.id === itemId ? { ...i, quantity } : i)),
        })),
      updateItemModifiers: (index, selectedModifiers) =>
        set((state) => {
          const items = state.items.slice();
          if (!items[index]) return { items };
          items[index] = { ...items[index], selectedModifiers };
          // Merge duplicates (same item id + same modifiers)
          const merged: CartItem[] = [];
          const key = (ci: CartItem) => ci.item.id + '|' + JSON.stringify(ci.selectedModifiers || {});
          const map = new Map<string, CartItem>();
          for (const ci of items) {
            const k = key(ci);
            const existing = map.get(k);
            if (existing) existing.quantity += ci.quantity;
            else map.set(k, { ...ci });
          }
          map.forEach((v) => merged.push(v));
          return { items: merged };
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
