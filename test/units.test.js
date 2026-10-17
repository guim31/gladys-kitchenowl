// -----------------------------------------------------------------------------
// The pure parts: the address typed by the user, the configuration, the
// KitchenOwl answers (real fixtures), the local day and midnight, and how the
// client classifies the errors of a real server.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_CONFIG, normalizeConfig, parseServerUrl } from '../src/config.js';
import { ERROR_KINDS, KitchenOwlClient } from '../src/kitchenowl/client.js';
import {
  findItem,
  localDate,
  mealsOn,
  normalizeName,
  parseHouseholds,
  parseLists,
  parsePlanner,
  resolveTimeZone,
  untilMidnight,
} from '../src/kitchenowl/model.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/kitchenowl/${name}.json`, import.meta.url), 'utf8'));

test('the address: a bare host, a copied browser URL, a reverse proxy prefix', () => {
  assert.equal(parseServerUrl('192.0.2.20:8080'), 'http://192.0.2.20:8080');
  assert.equal(
    parseServerUrl(' https://owl.example.org/household/1/items '),
    'https://owl.example.org',
  );
  assert.equal(parseServerUrl('https://example.org/kitchenowl/'), 'https://example.org/kitchenowl');
  assert.equal(parseServerUrl('http://192.0.2.20:8080/api/household'), 'http://192.0.2.20:8080');
  assert.equal(parseServerUrl('ftp://192.0.2.20'), null);
  assert.equal(parseServerUrl('http://user:pass@192.0.2.20'), null);
  assert.equal(parseServerUrl(''), null);
  assert.equal(parseServerUrl(undefined), null);
});

test('the configuration: defaults, a pasted "Bearer", an unknown interval', () => {
  const config = normalizeConfig({ api_token: ' Bearer abc.def.ghi ', poll_interval: '7' });
  assert.equal(config.token, 'abc.def.ghi');
  assert.equal(config.pollIntervalMs, Number(DEFAULT_CONFIG.poll_interval) * 1000);
  assert.equal(config.language, 'fr');
  assert.equal(config.url, null);
  assert.equal(config.urlTyped, false);
  assert.equal(normalizeConfig({ allow_self_signed: 'true' }).allowSelfSigned, true);
  assert.equal(normalizeConfig(null).language, 'fr');
});

test('real answers: households, lists with their items, the planner', () => {
  const [household] = parseHouseholds(fixture('households'));
  assert.equal(household.name, 'Maison');
  assert.equal(household.defaultListId, 1);
  assert.equal(household.members.get(1), 'Alice');

  const lists = parseLists(fixture('shoppinglists'), 1);
  assert.deepEqual(
    lists.map((list) => [list.id, list.name, list.items.length]),
    [
      [1, 'Default', 3],
      [2, 'Bricolage', 1],
    ],
  );
  assert.deepEqual(lists[0].items[0], {
    id: 1,
    name: 'Lait',
    description: '2 L',
    addedAt: 1792242648734,
    addedBy: 1,
  });

  const plans = parsePlanner(fixture('planner'));
  assert.deepEqual(
    plans.map((plan) => [plan.day, plan.recipe]),
    [
      [null, 'Soupe de potiron'],
      ['2026-10-17', 'Gratin dauphinois'],
      ['2026-10-17', 'Crêpes'],
      ['2026-10-18', 'Salade niçoise'],
    ],
  );
  assert.deepEqual(mealsOn(plans, '2026-10-17'), ['Gratin dauphinois', 'Crêpes']);
  assert.deepEqual(mealsOn(plans, '2026-10-19'), []);
});

test('garbage in, nothing out', () => {
  assert.deepEqual(parseHouseholds({ msg: 'x' }), []);
  assert.deepEqual(parseLists([{ id: 'x' }, { id: 3, items: [{ id: 1 }] }], 1), [
    { id: 3, householdId: 1, name: '#3', items: [], recent: [] },
  ]);
  assert.deepEqual(parsePlanner([{ cooking_date: 0 }]), []);
});

test('names are compared without case, accents or ligatures', () => {
  assert.equal(normalizeName('  Œufs  frais '), 'oeufs frais');
  assert.equal(normalizeName('Crème fraîche'), 'creme fraiche');
  const list = parseLists(fixture('shoppinglists'), 1)[0];
  assert.equal(findItem(list, 'OEUFS').id, 3);
  assert.equal(findItem(list, 'lai'), null);
  assert.equal(findItem(list, ''), null);
});

test('the local day and the next midnight, daylight saving included', () => {
  const paris = 'Europe/Paris';
  // 23:30 UTC on 17/10 is already the 18th in Paris.
  assert.equal(localDate(Date.UTC(2026, 9, 17, 23, 30), paris), '2026-10-18');
  assert.equal(localDate(Date.UTC(2026, 9, 17, 12), paris, 1), '2026-10-18');
  assert.equal(localDate(Date.UTC(2026, 11, 31, 12), 'UTC', 1), '2027-01-01');
  assert.equal(untilMidnight(Date.UTC(2026, 9, 17, 21, 59), paris), 60_000);
  // The night of 24 to 25/10/2026 lasts one hour more in Paris: 22:00 UTC is midnight.
  assert.equal(untilMidnight(Date.UTC(2026, 9, 24, 21, 0), paris), 60 * 60_000);
  assert.equal(untilMidnight(Date.UTC(2026, 9, 25, 12, 0), paris), 11 * 60 * 60_000);
  assert.equal(resolveTimeZone('Not/AZone'), 'UTC');
  assert.equal(resolveTimeZone(undefined), 'UTC');
});

/** A client whose single answer (or network error) is given. */
function clientAnswering(answer) {
  return new KitchenOwlClient({
    url: 'http://192.0.2.20:8080',
    token: 'abc.def.ghi',
    request: async (url, options) => {
      assert.equal(options.headers.authorization, 'Bearer abc.def.ghi');
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
  });
}

const reply = (status, body, type = 'application/json') => ({
  status,
  headers: { 'content-type': type },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

async function kindOf(answer) {
  try {
    await clientAnswering(answer).households();
  } catch (err) {
    return err.kind;
  }
  return 'ok';
}

test('the client classifies the answers of a real KitchenOwl', async () => {
  assert.equal(await kindOf(reply(200, fixture('households'))), 'ok');
  assert.equal(await kindOf(reply(401, fixture('error-401-no-token'))), ERROR_KINDS.AUTH);
  assert.equal(await kindOf(reply(422, fixture('error-422-bad-token'))), ERROR_KINDS.AUTH);
  assert.equal(await kindOf(reply(422, fixture('error-422-forged-token'))), ERROR_KINDS.AUTH);
  assert.equal(
    await kindOf(reply(404, 'Requested resource not found', 'text/html; charset=utf-8')),
    ERROR_KINDS.NOT_KITCHENOWL,
  );
  assert.equal(
    await kindOf(reply(200, '<!DOCTYPE html>', 'text/html')),
    ERROR_KINDS.NOT_KITCHENOWL,
  );
  assert.equal(await kindOf(reply(200, { msg: 'x' })), ERROR_KINDS.NOT_KITCHENOWL);
  assert.equal(await kindOf(reply(301, '')), ERROR_KINDS.REDIRECT);
  assert.equal(await kindOf(reply(429, '')), ERROR_KINDS.RATE_LIMIT);
  assert.equal(await kindOf(reply(500, 'Something went wrong', 'text/html')), ERROR_KINDS.HTTP);
  const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
  assert.equal(await kindOf(refused), ERROR_KINDS.UNREACHABLE);
  const selfSigned = Object.assign(new Error('self-signed'), {
    code: 'DEPTH_ZERO_SELF_SIGNED_CERT',
  });
  assert.equal(await kindOf(selfSigned), ERROR_KINDS.TLS);
});

test('the client sends the bodies KitchenOwl expects', async () => {
  const sent = [];
  const client = new KitchenOwlClient({
    url: 'http://192.0.2.20:8080',
    token: 't',
    request: async (url, options) => {
      sent.push([options.method, url.replace('http://192.0.2.20:8080', ''), options.json]);
      return reply(200, { msg: 'DONE' });
    },
  });
  await client.addItem(1, 'Lait', '2 L');
  await client.setDescription(1, 5, '6 L');
  await client.removeItem(1, 5);
  assert.deepEqual(sent, [
    ['POST', '/api/shoppinglist/1/add-item-by-name', { name: 'Lait', description: '2 L' }],
    ['POST', '/api/shoppinglist/1/item/5', { description: '6 L' }],
    ['DELETE', '/api/shoppinglist/1/item', { item_id: 5 }],
  ]);
});
