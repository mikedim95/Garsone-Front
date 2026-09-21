import test from 'node:test';
import assert from 'node:assert/strict';
import { modifierSelectionValid, invalidCartItem, MAX_ITEM_QUANTITY } from '../src/components/menu/orderValidation.ts';

const modifier = { id: 'flavours', name: 'Flavours', required: true, minSelect: 2, maxSelect: 2,
  options: [{ id: 'mint', label: 'Mint' }, { id: 'apple', label: 'Apple' }, { id: 'lemon', label: 'Lemon' }] };
const item = { id: 'item-1', name: 'Tea', priceCents: 500, available: true, modifiers: [modifier] };
const cartItem = { item, quantity: 1, selectedModifiers: { flavours: ['mint', 'apple'] } };

test('required modifiers honor their actual minimum and maximum, including repeated and removed options', () => {
  assert.equal(modifierSelectionValid(modifier, { flavours: ['mint'] }), false);
  assert.equal(modifierSelectionValid(modifier, { flavours: ['mint', 'mint'] }), false);
  assert.equal(modifierSelectionValid(modifier, { flavours: ['mint', 'apple'] }), true);
  assert.equal(modifierSelectionValid(modifier, { flavours: ['mint', 'apple', 'lemon'] }), false);
  assert.equal(modifierSelectionValid(modifier, { flavours: ['mint', 'removed-option'] }), false);
});

test('optional modifiers can be cleared and an unbounded modifier allows every valid option', () => {
  assert.equal(modifierSelectionValid({ ...modifier, required: false, minSelect: 0, maxSelect: 1 }, {}), true);
  assert.equal(modifierSelectionValid({ ...modifier, maxSelect: null }, { flavours: ['mint', 'apple', 'lemon'] }), true);
});

test('checkout rejects stale/unavailable menu items, invalid quantities and options without removing the draft', () => {
  const cart = [cartItem];
  assert.equal(invalidCartItem(cart, [item]), undefined);
  assert.equal(invalidCartItem(cart, []), cartItem);
  assert.equal(invalidCartItem(cart, [{ ...item, isAvailable: false }]), cartItem);
  for (const quantity of [0, -1, 1.5, NaN, MAX_ITEM_QUANTITY + 1]) {
    assert.ok(invalidCartItem([{ ...cartItem, quantity }], [item]));
  }
  assert.ok(invalidCartItem([{ ...cartItem, selectedModifiers: { missing: 'option' } }], [item]));
  assert.deepEqual(cart, [cartItem]);
  assert.equal(cartItem.quantity, 1);
  assert.deepEqual(cartItem.selectedModifiers.flavours, ['mint', 'apple']);
});
