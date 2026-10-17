// -----------------------------------------------------------------------------
// An in-memory KitchenOwl, answering the routes the integration calls the way
// the real server does (status codes, 401 without token, 422 `{ msg }` on a
// malformed one, plain-text 404 on a missing list or an unknown path, the web
// page outside /api, duplicates ignored by add-item-by-name, ASCII-only case
// folding of SQLite). Its starting data are real answers of
// tombursch/kitchenowl in Docker (API 124, 17/10/2026,
// test/fixtures/kitchenowl/): one household "Maison" with two lists —
// "Default" (Lait 2 L, Tomates 1 kg, Œufs 12) and "Bricolage" (Vis M4) — and
// a planner with two recipes today, one tomorrow and one "some day".
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/kitchenowl/${name}.json`, import.meta.url), 'utf8'));

export const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJlLXRlc3Q';
export const ALICE = 1;

const json = (status, value) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});
const text = (status, value) => ({
  status,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: value,
});
const NOT_FOUND = text(404, 'Requested resource not found');
// SQLite's lower() folds ASCII letters only.
const asciiLower = (value) => value.trim().replace(/[A-Z]/g, (c) => c.toLowerCase());

export class FakeKitchenOwl {
  constructor({ now = () => Date.now(), token = TOKEN, user = ALICE } = {}) {
    this.now = now;
    this.token = token;
    this.user = user;
    this.households = structuredClone(fixture('households'));
    this.lists = structuredClone(fixture('shoppinglists'));
    this.plans = structuredClone(fixture('planner'));
    // The household catalog: items keep their id when they come back on a list.
    this.catalog = [
      ...this.lists.flatMap((list) => list.items),
      ...this.lists.flatMap((list) => list.recentItems),
    ].map(({ id, name, household_id: householdId }) => ({ id, name, householdId }));
    this.nextItemId = 100;
    this.online = true;
    this.requests = [];
  }

  list(id) {
    return this.lists.find((list) => list.id === id);
  }

  /** Put an item on a list as `user`, as KitchenOwl does. */
  addAs(listId, name, description = '', user = this.user) {
    const list = this.list(listId);
    let item = this.catalog.find(
      (entry) =>
        entry.householdId === list.household_id && asciiLower(entry.name) === asciiLower(name),
    );
    if (!item) {
      item = {
        id: this.nextItemId++,
        name: name.trim().slice(0, 128),
        householdId: list.household_id,
      };
      this.catalog.push(item);
    }
    if (!list.items.some((entry) => entry.id === item.id)) {
      const at = this.now();
      list.items.push({
        category_id: null,
        created_at: at,
        created_by: user,
        default: false,
        default_key: null,
        description,
        household_id: list.household_id,
        icon: null,
        id: item.id,
        name: item.name,
        ordering: 0,
        support: 0,
        updated_at: at,
      });
    }
    return item;
  }

  removeFrom(listId, itemId) {
    const list = this.list(listId);
    list.items = list.items.filter((entry) => entry.id !== itemId);
  }

  handle(url, { method = 'GET', headers = {}, json: body } = {}) {
    const { pathname, search } = new URL(url);
    this.requests.push({ method, path: pathname, search, body });
    if (!pathname.startsWith('/api/')) {
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<!DOCTYPE html>' };
    }
    const routes = [
      ['GET', /^\/api\/household$/],
      ['GET', /^\/api\/household\/(\d+)\/shoppinglist$/],
      ['GET', /^\/api\/household\/(\d+)\/planner$/],
      ['POST', /^\/api\/shoppinglist\/(\d+)\/add-item-by-name$/],
      ['POST', /^\/api\/shoppinglist\/(\d+)\/item\/(\d+)$/],
      ['DELETE', /^\/api\/shoppinglist\/(\d+)\/item$/],
    ];
    const route = routes.findIndex(([verb, pattern]) => verb === method && pattern.test(pathname));
    if (route === -1) {
      return NOT_FOUND;
    }
    const auth = headers.authorization;
    if (!auth) {
      return json(401, fixture('error-401-no-token'));
    }
    if (auth !== `Bearer ${this.token}`) {
      return json(422, fixture('error-422-forged-token'));
    }
    const [, first, second] = pathname.match(routes[route][1]).map(Number);
    const mine = (householdId) =>
      this.households.some(
        (household) =>
          household.id === householdId && household.member.some((m) => m.id === this.user),
      );
    switch (route) {
      case 0:
        return json(200, this.households);
      case 1:
        return json(
          200,
          mine(first) ? this.lists.filter((list) => list.household_id === first) : [],
        );
      case 2:
        return json(
          200,
          mine(first) ? this.plans.filter((plan) => plan.household_id === first) : [],
        );
      case 3: {
        const list = this.list(first);
        if (!list) {
          return NOT_FOUND;
        }
        if (typeof body?.name !== 'string') {
          return text(400, 'Request invalid');
        }
        const item = this.addAs(first, body.name, body.description ?? '');
        return json(200, { id: item.id, name: item.name, household_id: item.householdId });
      }
      case 4: {
        const entry = this.list(first)?.items.find((item) => item.id === second);
        if (!entry) {
          return NOT_FOUND;
        }
        entry.description = body?.description ?? '';
        return json(200, entry);
      }
      default: {
        if (!this.list(first)) {
          return NOT_FOUND;
        }
        this.removeFrom(first, body?.item_id);
        return json(200, { msg: 'DONE' });
      }
    }
  }
}

/** The network: one fake server per base URL; anything else does not answer. */
export function createNetwork(servers) {
  return {
    servers,
    async request(url, options = {}) {
      const base = Object.keys(servers).find((origin) => url.startsWith(`${origin}/`));
      const server = base ? servers[base] : null;
      if (!server || !server.online) {
        const error = new Error('connect ECONNREFUSED');
        error.code = 'ECONNREFUSED';
        throw error;
      }
      return server.handle(url, options);
    },
  };
}
