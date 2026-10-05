import test from 'node:test';
import assert from 'node:assert/strict';
import { cartAfterConfirmation, clearSubmission, newSubmissionId, readSubmission, saveSubmission, submissionDefinitelyRejected } from '../src/lib/orderSubmission.ts';
import { RealtimeConnection } from '../src/lib/realtimeConnection.ts';

const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const payload = { tableId: '11111111-1111-4111-8111-111111111111', items: [{ itemId: 'tea', quantity: 2, modifiers: '{"milk":"oat"}' }], note: 'No ice' };
const cart = [{ item: { id: 'tea' }, quantity: 2, selectedModifiers: { milk: 'oat' } }];

test('a lost response and reload reuse the durable submission, even after the draft changes', () => {
  const store = storage();
  const first = saveSubmission('noor', payload, cart, store);
  payload.items[0].quantity = 3;
  const recovered = readSubmission('noor', payload.tableId, store);
  assert.equal(recovered.payload.items[0].quantity, 2);
  assert.deepEqual(saveSubmission('noor', payload, cart, store), first);
  assert.equal(recovered.payload.submissionId, first.payload.submissionId);
  clearSubmission(recovered, store);
  assert.equal(readSubmission('noor', payload.tableId, store), null);
  assert.notEqual(saveSubmission('noor', payload, cart, store).payload.submissionId, first.payload.submissionId);
});

test('pending submissions never cross venue or table boundaries', () => {
  const store = storage();
  saveSubmission('noor', payload, cart, store);
  assert.equal(readSubmission('other', payload.tableId, store), null);
  assert.equal(readSubmission('noor', '22222222-2222-4222-8222-222222222222', store), null);
});

test('storage refusal fails before an order can be posted and corrupt journals are not silently replaced', () => {
  const broken = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  assert.throws(() => saveSubmission('noor', payload, cart, broken), /unavailable/);
  const corrupt = { ...broken, getItem: () => '{invalid' };
  assert.throws(() => saveSubmission('noor', payload, cart, corrupt));
});

test('UUID generation only requires getRandomValues on an insecure HTTP LAN origin', () => {
  const crypto = { getRandomValues: bytes => bytes.fill(255) };
  assert.equal(newSubmissionId(crypto), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.notEqual(newSubmissionId(), newSubmissionId());
});

test('confirmation preserves items and quantities added during a connection outage', () => {
  const current = [{ ...cart[0], quantity: 4 }, { item: { id: 'tea' }, quantity: 1, selectedModifiers: { milk: 'dairy' } }, { item: { id: 'cake' }, quantity: 1 }];
  assert.deepEqual(cartAfterConfirmation(current, cart), [{ ...current[0], quantity: 2 }, current[1], current[2]]);
  assert.equal(current[0].quantity, 4);
  assert.deepEqual(cartAfterConfirmation([], cart), []);
});

test('timeouts, server failures and key conflicts retain the original submission key', () => {
  for (const status of [0, 200, 401, 403, 408, 409, 425, 429, 500, 502, 504]) assert.equal(submissionDefinitelyRejected({ status }), false);
  for (const status of [400, 404, 422]) assert.equal(submissionDefinitelyRejected({ status }), true);
});

class FakeSocket extends EventTarget {
  readyState = 0;
  closed = false;
  close() { this.closed = true; this.readyState = 3; this.dispatchEvent(new Event('close')); }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  message() { this.dispatchEvent(new MessageEvent('message', { data: '{}' })); }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const setupConnection = () => {
  const sockets = [], statuses = [], messages = [];
  let url = 'ws://local/events/ws?table=one';
  const connection = new RealtimeConnection({ url: () => url, enabled: () => true, delay: 5,
    create: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    status: value => statuses.push(value), message: value => messages.push(value) });
  return { connection, sockets, statuses, messages, setUrl: value => { url = value; } };
};

test('late events from a replaced table socket cannot disconnect or deliver to the new context', async () => {
  const { connection, sockets, statuses, messages, setUrl } = setupConnection();
  connection.connect(); sockets[0].open();
  setUrl('ws://local/events/ws?table=two'); connection.refresh(); sockets[1].open();
  sockets[0].message(); sockets[0].dispatchEvent(new Event('error')); sockets[0].open();
  assert.equal(connection.isConnected(), true);
  assert.equal(messages.length, 0);
  assert.deepEqual(statuses, [true, false, true]);
  await delay(15);
  assert.equal(sockets.length, 2);
  connection.disconnect();
});

test('intentional disconnect cancels an already scheduled reconnect', async () => {
  const { connection, sockets } = setupConnection();
  connection.connect(); sockets[0].open(); sockets[0].close();
  connection.disconnect(); connection.refresh();
  await delay(15);
  assert.equal(sockets.length, 1);
  assert.equal(connection.isConnected(), false);
});

test('suspending for phone sleep preserves the intent to reconnect on wake', () => {
  const { connection, sockets } = setupConnection();
  connection.connect(); sockets[0].open(); connection.suspend();
  assert.equal(sockets[0].closed, true);
  connection.refresh(); sockets[1].open();
  assert.equal(connection.isConnected(), true);
  connection.disconnect();
});

test('removing a guest capability closes its existing socket without reconnecting anonymously', async () => {
  const { connection, sockets, setUrl } = setupConnection();
  connection.connect(); sockets[0].open();
  setUrl(null); connection.refresh();
  assert.equal(sockets[0].closed, true);
  assert.equal(connection.isConnected(), false);
  await delay(15);
  assert.equal(sockets.length, 1);
  connection.disconnect();
});

test('error and close for one failure schedule only one replacement socket', async () => {
  const { connection, sockets } = setupConnection();
  connection.connect(); sockets[0].open(); sockets[0].dispatchEvent(new Event('error')); sockets[0].close();
  await delay(15);
  assert.equal(sockets.length, 2);
  sockets[1].open(); connection.disconnect();
});
