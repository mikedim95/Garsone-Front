import test from 'node:test';
import assert from 'node:assert/strict';
import { customerVisitKey, endCustomerVisit, readCustomerVisit, saveCustomerVisit } from '../src/lib/customerVisitStorage.ts';

const makeStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const visit = { version: 1, storeSlug: 'noor', tableId: 'table-one', visitId: 'visit-one', token: 'a'.repeat(64), state: 'active' };

test('guest visit credentials are scoped to the exact venue and table', () => {
  const storage = makeStorage();
  saveCustomerVisit(visit, storage);
  assert.deepEqual(readCustomerVisit('noor', 'table-one', storage), visit);
  assert.equal(readCustomerVisit('other', 'table-one', storage), null);
  assert.equal(readCustomerVisit('noor', 'table-two', storage), null);
});

test('ending a visit leaves a durable tombstone instead of treating the browser as a new guest', () => {
  const storage = makeStorage();
  saveCustomerVisit(visit, storage);
  endCustomerVisit(visit, storage);
  const restored = readCustomerVisit('noor', 'table-one', storage);
  assert.equal(restored.state, 'ended');
  assert.equal(restored.visitId, visit.visitId);
  assert.equal(restored.token, visit.token);
});

test('corrupt credentials fail closed and cannot be mistaken for permission to autojoin a new visit', () => {
  const storage = makeStorage();
  storage.setItem(customerVisitKey('noor', 'table-one'), '{broken');
  assert.throws(() => readCustomerVisit('noor', 'table-one', storage));
  storage.setItem(customerVisitKey('noor', 'table-one'), JSON.stringify({ ...visit, token: 'short' }));
  assert.throws(() => readCustomerVisit('noor', 'table-one', storage), /invalid/);
  storage.setItem(customerVisitKey('noor', 'table-one'), JSON.stringify({ ...visit, storeSlug: 'other' }));
  assert.throws(() => readCustomerVisit('noor', 'table-one', storage), /invalid/);
});

test('a browser that refuses persistence cannot silently lose its closed-visit boundary', () => {
  assert.throws(() => saveCustomerVisit(visit, { getItem: () => null, setItem: () => {} }), /unavailable/);
});

test('a table transfer preserves the same party capability and original pending order location', () => {
  const storage = makeStorage();
  saveCustomerVisit(visit, storage);
  saveCustomerVisit({ ...visit, tableId: 'table-two', pendingTableId: 'table-one' }, storage);
  assert.equal(readCustomerVisit('noor', 'table-two', storage).visitId, visit.visitId);
  assert.equal(readCustomerVisit('noor', 'table-two', storage).token, visit.token);
  assert.equal(readCustomerVisit('noor', 'table-two', storage).pendingTableId, 'table-one');
  assert.equal(readCustomerVisit('noor', 'table-one', storage).visitId, visit.visitId);
});
