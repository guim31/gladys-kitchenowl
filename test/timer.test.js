// -----------------------------------------------------------------------------
// The reading timer of the container. Gladys never polls a device published
// with should_poll: false (nor one created without should_poll,
// GladysAssistant/Gladys#3198): KitchenOwl must be read by the hub's own
// timer, with no onPoll at all — and at local midnight, so that "today's
// meals" move on time whatever the interval.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_CONFIG, createAll, createClock, createWorld, householdId } from './helpers/world.js';

const settle = async () => {
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const reads = (server) => server.requests.filter((r) => r.path === '/api/household').length;

test('the internal timer reads KitchenOwl without any onPoll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock();
  const w = await createWorld({
    clock,
    config: { ...BASE_CONFIG, poll_interval: '120' },
    timers: true,
  });
  t.after(() => w.app.stop());
  const polled = t.mock.method(w.hub, 'poll');
  await createAll(w);
  assert.ok(
    w.fake.discoveredDevices.every((device) => device.should_poll === false),
    'Gladys is not asked to poll',
  );

  const before = reads(w.server);
  for (let i = 0; i < 3; i += 1) {
    clock.advance(120_000);
    t.mock.timers.tick(120_000);
    await settle();
  }
  assert.equal(reads(w.server) - before, 3, 'one reading per interval');
  assert.ok(polled.mock.callCount() >= 3);
});

test('the timer wakes up at local midnight, shorter than the interval', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // 23:59 in Paris: today is the 17th (two recipes), tomorrow the 18th.
  const clock = createClock(Date.UTC(2026, 9, 17, 21, 59));
  const w = await createWorld({
    clock,
    config: { ...BASE_CONFIG, poll_interval: '300' },
    timers: true,
  });
  t.after(() => w.app.stop());
  await createAll(w);
  const today = householdId(w.gladys).feature('meals_today');
  assert.equal(w.fake.lastState(today), 'Gratin dauphinois, Crêpes');
  clock.advance(62_000);
  t.mock.timers.tick(62_000);
  await settle();
  assert.equal(w.fake.lastState(today), 'Salade niçoise', 'read one minute later, not five');
  assert.equal(
    w.fake.lastState(householdId(w.gladys).feature('meals_tomorrow')),
    'Nothing planned',
  );
});

test('the timer stops with the integration', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await createWorld({ timers: true });
  await w.app.stop();
  const before = w.server.requests.length;
  t.mock.timers.tick(60 * 60_000);
  await settle();
  assert.equal(w.server.requests.length, before);
});
