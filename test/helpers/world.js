// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake KitchenOwl on a fake
// network, a temporary /data, a manual clock and the Paris time zone, with
// the integration wired on top through registerHandlers. No timer runs unless
// `timers: true` (with node:test mock timers): the tests read KitchenOwl with
// `world.hub.poll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { ALICE, FakeKitchenOwl, TOKEN, createNetwork } from './fakeKitchenOwl.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL_1 = 'http://192.0.2.20:8080';
export const TIME_ZONE = 'Europe/Paris';
// The fixtures were captured on 17/10/2026 at 13:11 UTC (15:11 in Paris).
export const START = Date.UTC(2026, 9, 17, 13, 15, 0);

export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const BASE_CONFIG = { url: URL_1, api_token: TOKEN, language: 'en' };

export async function createWorld({
  clock = createClock(),
  server,
  config = BASE_CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-kitchenowl-')),
  timings = {},
  timers = false,
} = {}) {
  const kitchenowl = server ?? new FakeKitchenOwl({ now: clock.now });
  const network = createNetwork({ [URL_1]: kitchenowl });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
    timeZone: TIME_ZONE,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server: kitchenowl, app, hub: app.hub, clock, dataDir };
}

export const listId = (gladys, id) => gladys.externalIds('shopping_list', `list-${id}`);
export const householdId = (gladys, id = 1) => gladys.externalIds('household', `household-${id}`);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { ALICE, FakeKitchenOwl, TOKEN };
