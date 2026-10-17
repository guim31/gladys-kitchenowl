// -----------------------------------------------------------------------------
// The "Shopping list" widget: content within the core budget (validated by
// the SDK's validateWidgetContent), the list chosen in the settings, the
// "Add" and "Check off" forms, the direct check buttons, the degraded states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildDevices } from '../src/devices.js';
import { createWorld, householdId, listId } from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet('shopping_list', { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  const { content: tree } = ack.data;
  assert.deepEqual(validateWidgetContent(tree), [], 'within the core vocabulary and budget');
  return tree;
}

const ofType = (data, type) => data.components.filter((component) => component.type === type);
const texts = (data) => ofType(data, 'text').map((component) => component.text);

async function tap(w, button, values) {
  const ack = await w.fake.widgetAction('shopping_list', button.action.key, button.action.params, {
    settings: {},
    values,
  });
  assert.equal(ack.success, true, ack.error);
  return ack.data;
}

test('the default list: count, items, Add, Check off and two direct checks', async (t) => {
  const w = await world(t);
  const data = await content(w);
  assert.ok(data.components.length <= 8);
  assert.deepEqual(
    ofType(data, 'value').map((tile) => [tile.label, tile.value]),
    [['Default', 3]],
  );
  assert.deepEqual(
    ofType(data, 'status')[0].items.map((row) => [row.label, row.value]),
    [
      ['Lait', '2 L'],
      ['Tomates', '1 kg'],
      ['Œufs', '12'],
    ],
  );
  const buttons = ofType(data, 'button');
  assert.deepEqual(
    buttons.map((button) => [button.label, button.action.key]),
    [
      ['Add', 'add'],
      ['Check off', 'check'],
      ['Lait', 'check_1'],
      ['Tomates', 'check_2'],
    ],
  );
  assert.deepEqual(
    buttons[1].action.fields[0].options.map((option) => option.value),
    ['1', '4', '3'],
  );
  // The household device and the default list device are the same view.
  assert.deepEqual(await content(w, { device: householdId(w.gladys).device }), data);
  assert.deepEqual(await content(w, { device: listId(w.gladys, 1).device }), data);
});

test('another list, in another language', async (t) => {
  const w = await world(t);
  const data = await content(w, { device: listId(w.gladys, 2).device }, 'fr');
  assert.deepEqual(
    ofType(data, 'button').map((button) => button.label),
    ['Ajouter', 'Cocher', 'Vis'],
  );
  assert.equal(ofType(data, 'value')[0].label, 'Bricolage');
});

test('"Add" puts the typed item on the list and answers in four languages', async (t) => {
  const w = await world(t);
  const [add] = ofType(await content(w, { device: listId(w.gladys, 2).device }), 'button');
  const answer = await tap(w, add, { name: 'Chevilles', description: '8 mm' });
  assert.deepEqual(Object.keys(answer.message), ['en', 'fr', 'de', 'es']);
  assert.equal(answer.message.fr, '« Chevilles » ajouté à Bricolage.');
  assert.ok(w.server.list(2).items.some((item) => item.name === 'Chevilles'));
  const again = await tap(w, add, { name: 'chevilles' });
  assert.equal(again.message.en, '"Chevilles" is already on Bricolage.');
});

test('"Check off" removes the chosen item; a direct check removes its own item', async (t) => {
  const w = await world(t);
  const buttons = ofType(await content(w), 'button');
  const answer = await tap(w, buttons[1], { item: '3' });
  assert.equal(answer.message.en, '"Œufs" checked off Default.');
  assert.ok(!w.server.list(1).items.some((item) => item.id === 3));
  await tap(w, buttons[2]);
  assert.deepEqual(
    w.server.list(1).items.map((item) => item.name),
    ['Tomates'],
  );
  // A stale widget: the item is gone already. Nothing else is removed.
  const stale = await tap(w, buttons[2]);
  assert.equal(stale.message.en, '"Lait" is no longer on Default.');
  assert.deepEqual(
    w.server.list(1).items.map((item) => item.name),
    ['Tomates'],
  );
});

test('a long list shows nine rows and a "more" row', async (t) => {
  const w = await world(t);
  for (let i = 0; i < 12; i += 1) {
    w.server.addAs(1, `Article ${i}`);
  }
  await w.hub.poll();
  const rows = ofType(await content(w), 'status')[0].items;
  assert.equal(rows.length, 10);
  assert.deepEqual([rows[9].label, rows[9].value], ['More items', 6]);
});

test('an empty list: a sentence and the Add button only', async (t) => {
  const w = await world(t);
  w.server.list(2).items = [];
  await w.hub.poll();
  const data = await content(w, { device: listId(w.gladys, 2).device });
  assert.deepEqual(texts(data), ['The list is empty.']);
  assert.deepEqual(
    ofType(data, 'button').map((button) => button.action.key),
    ['add'],
  );
});

test('degraded states: not configured, unknown list, KitchenOwl down', async (t) => {
  const none = await world(t, { config: {} });
  assert.match(texts(await content(none))[0], /Enter the address of your KitchenOwl/);

  const w = await world(t);
  assert.match(
    texts(await content(w, { device: listId(w.gladys, 42).device }))[0],
    /no longer exists/,
  );
  w.server.online = false;
  await w.hub.poll();
  const stale = await content(w);
  assert.deepEqual(texts(stale), ['KitchenOwl does not answer: last known list.']);
  assert.equal(ofType(stale, 'button').length, 0, 'no button while KitchenOwl is down');
});

test('every list a widget can show is a published device', async (t) => {
  const w = await world(t);
  const devices = buildDevices(w.gladys, w.hub.households, w.hub.lists, 'en').map(
    (device) => device.external_id,
  );
  for (const list of w.hub.lists) {
    assert.ok(devices.includes(listId(w.gladys, list.id).device));
  }
});

test('a refused token is not shown as an outage in the widget', async (t) => {
  const w = await world(t);
  w.server.token = 'another.token.now';
  await w.hub.poll();
  assert.deepEqual(texts(await content(w)), [
    'KitchenOwl: token refused: create a new long-lived token in KitchenOwl',
  ]);
});
