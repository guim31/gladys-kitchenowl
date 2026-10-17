// -----------------------------------------------------------------------------
// The hub against the in-memory KitchenOwl (real answers): devices and states,
// the "item added" event (never at start, once per addition, across
// restarts), the two scene actions, and the connection status.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONNECTION_TEXT, ERROR_TEXT } from '../src/texts.js';
import {
  BASE_CONFIG,
  FakeKitchenOwl,
  createAll,
  createClock,
  createWorld,
  householdId,
  listId,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const added = (w) => w.fake.sceneEvents.filter((event) => event.key === 'item_added');

test('one device per shopping list and one per household, with their states', async (t) => {
  const w = await world(t);
  await createAll(w);
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => [device.name, device.external_id]),
    [
      ['KitchenOwl Default', listId(w.gladys, 1).device],
      ['KitchenOwl Bricolage', listId(w.gladys, 2).device],
      ['KitchenOwl Maison', householdId(w.gladys).device],
    ],
  );
  assert.equal(w.fake.lastState(listId(w.gladys, 1).feature('items')), 3);
  assert.equal(w.fake.lastState(listId(w.gladys, 2).feature('items')), 1);
  assert.equal(
    w.fake.lastState(householdId(w.gladys).feature('meals_today')),
    'Gratin dauphinois, Crêpes',
  );
  assert.equal(w.fake.lastState(householdId(w.gladys).feature('meals_tomorrow')), 'Salade niçoise');
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.ok(w.fake.transports.every((entry) => entry.transport === 'local'));
});

test('feature names follow the configured language', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  const names = w.fake.discoveredDevices.flatMap((device) => device.features.map((f) => f.name));
  assert.deepEqual(names, [
    'Articles à acheter',
    'Articles à acheter',
    'Repas du jour',
    'Repas de demain',
  ]);
  assert.equal(w.fake.lastState(householdId(w.gladys).feature('meals_tomorrow')), 'Salade niçoise');
});

test('only changes are published; a created device gets every state again', async (t) => {
  const w = await world(t);
  const count = w.fake.states.length;
  await w.hub.poll();
  assert.equal(w.fake.states.length, count, 'nothing changed, nothing sent');
  w.server.addAs(1, 'Beurre');
  await w.hub.poll();
  assert.equal(w.fake.states.length, count + 1);
  assert.equal(w.fake.lastState(listId(w.gladys, 1).feature('items')), 4);
  const before = w.fake.states.length;
  await w.fake.deviceCreated(w.fake.discoveredDevices[2]);
  assert.ok(w.fake.states.length > before, 'states sent again after the device is added');
  assert.ok(w.fake.widgetRefreshes.length > 0);
});

test('nothing fires for the items already on the lists at start', async (t) => {
  const w = await world(t);
  await w.hub.poll();
  assert.deepEqual(added(w), []);
});

test('an item added in KitchenOwl fires "item added" once, with who added it', async (t) => {
  const w = await world(t);
  w.server.addAs(2, 'Chevilles', '8 mm');
  await w.hub.poll();
  await w.hub.poll();
  assert.deepEqual(
    added(w).map((event) => event.data),
    [
      {
        list: listId(w.gladys, 2).device,
        list_name: 'Bricolage',
        item: 'Chevilles',
        description: '8 mm',
        added_by: 'Alice',
        from_gladys: false,
      },
    ],
  );
});

test('an item checked off then put back fires again; a description edit does not', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  w.server.list(1).items[0].description = '6 L';
  await w.hub.poll();
  assert.deepEqual(added(w), []);
  w.server.removeFrom(1, 1);
  await w.hub.poll();
  clock.advance(60_000);
  w.server.addAs(1, 'Lait');
  await w.hub.poll();
  assert.deepEqual(
    added(w).map((event) => event.data.item),
    ['Lait'],
  );
});

test('an item added while the integration was stopped fires at the next start', async (t) => {
  const clock = createClock();
  const dataDir = mkdtempSync(join(tmpdir(), 'gladys-kitchenowl-'));
  const server = new FakeKitchenOwl({ now: clock.now });
  const first = await createWorld({ clock, server, dataDir });
  await first.app.stop();
  server.addAs(1, 'Farine');
  const second = await world(t, { clock, server, dataDir });
  assert.deepEqual(
    added(second).map((event) => event.data.item),
    ['Farine'],
  );
  assert.deepEqual(added(first), []);
});

test('a new list, or thirty items at once, does not flood the scenes', async (t) => {
  const w = await world(t);
  w.server.lists.push({ ...structuredClone(w.server.list(2)), id: 9, name: 'Apéro' });
  for (let i = 0; i < 30; i += 1) {
    w.server.addAs(1, `Ingrédient ${i}`);
  }
  await w.hub.poll();
  assert.equal(added(w).length, 20, 'capped per list and per reading');
  assert.ok(added(w).every((event) => event.data.list === listId(w.gladys, 1).device));
});

test('add_item puts an item on the default list, once; the event says from Gladys', async (t) => {
  const w = await world(t);
  const ack = await w.fake.sceneAction('add_item', { item: '  Beurre ', description: 'doux' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    item: 'Beurre',
    list_name: 'Default',
    already_on_list: false,
  });
  const item = w.server.list(1).items.find((entry) => entry.name === 'Beurre');
  assert.equal(item.description, 'doux');
  assert.equal(added(w).at(-1).data.from_gladys, true);
  assert.equal(w.fake.lastState(listId(w.gladys, 1).feature('items')), 4);

  const again = await w.fake.sceneAction('add_item', { item: 'beurre' });
  assert.deepEqual(again.data.outputs, {
    item: 'Beurre',
    list_name: 'Default',
    already_on_list: true,
  });
  assert.equal(w.server.list(1).items.length, 4);
  assert.equal(item.description, 'doux', 'no description given: the old one stays');
});

test('add_item recognizes an item whatever its case and accents, and updates its description', async (t) => {
  const w = await world(t);
  // SQLite folds ASCII only: KitchenOwl alone would add a second "oeufs".
  const ack = await w.fake.sceneAction('add_item', { item: 'oeufs', description: '24' });
  assert.deepEqual(ack.data.outputs, { item: 'Œufs', list_name: 'Default', already_on_list: true });
  assert.equal(w.server.list(1).items.length, 3);
  assert.equal(w.server.list(1).items.find((entry) => entry.id === 3).description, '24');
});

test('the list field: a list device, a household device (default list), an unknown device', async (t) => {
  const w = await world(t);
  const onList = await w.fake.sceneAction('add_item', {
    item: 'Clous',
    list: listId(w.gladys, 2).device,
  });
  assert.equal(onList.data.outputs.list_name, 'Bricolage');
  const onHousehold = await w.fake.sceneAction('add_item', {
    item: 'Sel',
    list: householdId(w.gladys).device,
  });
  assert.equal(onHousehold.data.outputs.list_name, 'Default');
  const unknown = await w.fake.sceneAction('add_item', {
    item: 'Sel',
    list: listId(w.gladys, 42).device,
  });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /no longer exists/);
  const empty = await w.fake.sceneAction('add_item', { item: '   ' });
  assert.equal(empty.success, false);
  assert.match(empty.error, /name of the item/);
});

test('remove_item checks an item off by name; absent, nothing happens', async (t) => {
  const w = await world(t);
  const ack = await w.fake.sceneAction('remove_item', { item: 'TOMATES' });
  assert.deepEqual(ack.data.outputs, { item: 'Tomates', list_name: 'Default', removed: true });
  assert.ok(!w.server.list(1).items.some((entry) => entry.name === 'Tomates'));
  assert.equal(w.fake.lastState(listId(w.gladys, 1).feature('items')), 2);
  const absent = await w.fake.sceneAction('remove_item', { item: 'Caviar' });
  assert.deepEqual(absent.data.outputs, { item: 'Caviar', list_name: 'Default', removed: false });
  assert.equal(
    w.server.requests.filter((request) => request.method === 'DELETE').length,
    1,
    'no request for an item that is not there',
  );
});

test('the language of the action errors follows the configuration', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  const ack = await w.fake.sceneAction('remove_item', { item: '' });
  assert.match(ack.error, /Indiquez le nom/);
});

test('connection status: no address, bad address, token refused, server down and back', async (t) => {
  const none = await world(t, { config: {} });
  assert.deepEqual(none.fake.connectionStatus.message, CONNECTION_TEXT.noUrl);
  const bad = await world(t, { config: { url: 'ftp://x', api_token: 'x' } });
  assert.deepEqual(bad.fake.connectionStatus.message, CONNECTION_TEXT.invalidUrl);
  const noToken = await world(t, { config: { url: '192.0.2.20:8080' } });
  assert.deepEqual(noToken.fake.connectionStatus.message, CONNECTION_TEXT.noToken);
  const refused = await world(t, { config: { ...BASE_CONFIG, api_token: 'not-a-token' } });
  assert.deepEqual(refused.fake.connectionStatus.message, ERROR_TEXT.auth);
  assert.equal(refused.fake.discoveredDevices.length, 0);

  const w = await world(t);
  w.server.online = false;
  await w.hub.poll();
  assert.deepEqual(w.fake.connectionStatus.message, ERROR_TEXT.unreachable);
  assert.ok(w.fake.transports.some((entry) => entry.transport === 'unreachable'));
  w.server.online = true;
  await w.hub.poll();
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a user in no household: the status says so', async (t) => {
  const server = new FakeKitchenOwl({ user: 7 });
  server.households = [];
  const w = await world(t, { server });
  assert.deepEqual(w.fake.connectionStatus.message, CONNECTION_TEXT.noHousehold);
});

test('"Test the connection" reports what it finds, or why it fails', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  const ok = await w.fake.action('test_connection', {});
  assert.equal(ok.success, true);
  assert.match(JSON.stringify(ok.data), /1 foyer\(s\), 2 liste\(s\) de courses, 4 article\(s\)/);
  w.server.online = false;
  const ko = await w.fake.action('test_connection', {});
  assert.equal(ko.success, false);
  assert.match(ko.error, /KitchenOwl : KitchenOwl ne répond pas/);
});

test('a new configuration reads the new server at once', async (t) => {
  const w = await world(t, { config: {} });
  await w.fake.configUpdated(BASE_CONFIG);
  assert.equal(w.fake.discoveredDevices.length, 3);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});
