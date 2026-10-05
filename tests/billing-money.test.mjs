import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoneyCents, selectedItemCents } from '../src/lib/billingMoney.ts';

test('cash amounts accept both decimal separators without rounding an extra fractional cent', () => {
  assert.equal(parseMoneyCents(' 12,05 '), 1205);
  assert.equal(parseMoneyCents('12.5'), 1250);
  assert.equal(parseMoneyCents('0.01'), 1);
  assert.equal(parseMoneyCents('19'), 1900);
  for (const value of ['0', '-1', '1.005', '1,234.56', '1e2', 'NaN', 'Infinity', '', '1.', '99999999999999999']) assert.equal(parseMoneyCents(value), null, value);
});

test('splitting a partly paid line never charges its already collected cents again', () => {
  const item = { quantity: 3, unitPriceCents: 500, totalCents: 1500, paidCents: 200, outstandingCents: 1300, remainingQuantity: 3 };
  assert.equal(selectedItemCents(item, 1), 500);
  assert.equal(selectedItemCents(item, 2), 1000);
  assert.equal(selectedItemCents(item, 3), 1300);
  assert.equal(selectedItemCents({ ...item, paidCents: 1200, outstandingCents: 300, remainingQuantity: 1 }, 1), 300);
  for (const quantity of [-1, 1.5, 4, NaN]) assert.equal(selectedItemCents(item, quantity), 0);
});
