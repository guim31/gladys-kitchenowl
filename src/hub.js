// -----------------------------------------------------------------------------
// The KitchenOwl hub: reads the server on a timer of the container, publishes
// the item counts of the shopping lists and the meals of the day when they
// change, fires the "item added" scene event, and adds or checks off items
// for the widget and the scene actions.
//
// Gladys never polls these devices (should_poll: false, and a device created
// without should_poll is never polled, GladysAssistant/Gladys#3198): the hub
// reads on its own timer, every 30 s to 5 minutes, and at local midnight so
// that "today" and "tomorrow" move on time. The scene event must fire even
// when no device was added.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';
import { buildDevices, deviceStates, householdIds, listIds } from './devices.js';
import { ERROR_KINDS, KitchenOwlClient, KitchenOwlError } from './kitchenowl/client.js';
import {
  findItem,
  findRecentName,
  itemKey,
  localDate,
  mealsOn,
  normalizeName,
  parseHouseholds,
  parseLists,
  parsePlanner,
  resolveTimeZone,
  untilMidnight,
} from './kitchenowl/model.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  RESULT_TEXT,
  allLanguages,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'kitchenowl-hub' });

export const WIDGET_KEY = 'shopping_list';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  ITEM_ADDED: 'item_added',
});

export const HUB_TIMINGS = {
  // A failed read is tried again this soon, whatever the interval.
  retryMs: 30_000,
  // Read this long after midnight, so the server's day agrees.
  wakeSlackMs: 2_000,
  // Never read more often than this.
  minDelayMs: 10_000,
  // Re-send unchanged values this often: Gladys shows "no recent value" after 48 h.
  heartbeatMs: 12 * 60 * 60_000,
};

// Items remembered per list (a list holds a few dozen items in practice).
const MAX_REMEMBERED = 1000;
// "Item added" events fired per list and per reading at most: a recipe that
// puts thirty ingredients on the list must not flood the scenes.
const MAX_EVENTS_PER_LIST = 20;
// An item seen this soon after Gladys added it is Gladys' own.
const OWN_ADD_MS = 30 * 60_000;
// The reading after a command is awaited at most this long: the scene action
// and the widget button answer within their 20 s.
const REFRESH_WAIT_MS = 3_000;
// KitchenOwl cuts item names at 128 characters.
const ITEM_NAME_MAX = 128;
const DESCRIPTION_MAX = 200;
// Items checked off lately read before an addition (the API caps it at 120).
const RECENT_ITEMS = 120;

export class KitchenOwlHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/kitchenowl/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   * @param {string} [options.timeZone] defaults to TZ, set by the Gladys supervisor
   */
  constructor({ gladys, store, request, timers = true, timings, now, timeZone }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.timeZone = resolveTimeZone(timeZone ?? process.env.TZ);
    this.config = null;
    this.client = null;
    this.reset();
    this.saved = { scope: null, lists: {} };
    /** Items added from Gladys, by `listId:name` → time: `from_gladys` of the event. */
    this.ownAdds = new Map();
    this.connection = null;
    this.devicesSignature = null;
    this.widgetSignature = null;
    this.transports = new Map();
    this.timer = null;
    this.polling = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  reset() {
    this.households = [];
    this.lists = [];
    this.plans = new Map();
    this.error = null;
    this.downSince = null;
    this.readAt = 0;
    this.connectedLogged = false;
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (connected, lost, back, user commands). A
  // problem that repeats is logged once, then at debug until it clears.

  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  get language() {
    return this.config?.language ?? 'en';
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      scope: typeof saved.scope === 'string' ? saved.scope : null,
      lists: saved.lists && typeof saved.lists === 'object' ? saved.lists : {},
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.connection = null;
    this.devicesSignature = null;
    this.transports.clear();
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const same =
      previous &&
      previous.url === config.url &&
      previous.token === config.token &&
      previous.allowSelfSigned === config.allowSelfSigned;
    if (!same) {
      this.reset();
      this.client =
        config.url && config.token
          ? new KitchenOwlClient({
              url: config.url,
              token: config.token,
              insecure: config.allowSelfSigned,
              request: this.request,
            })
          : null;
    }
    // A new language: the devices are published again.
    this.devicesSignature = null;
    this.gladys.forgetPublishedStates?.();
    await this.poll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.polling?.catch(() => {});
    await this.store.flush();
  }

  schedule(delay) {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setTimeout(() => {
      this.poll().catch((err) => this.problem('poll', 'Reading failed', err, 'error'));
    }, delay);
  }

  /** The interval, shortened to the next local midnight. */
  nextDelay() {
    const interval = this.config.pollIntervalMs;
    if (this.error) {
      return Math.min(interval, this.timings.retryMs);
    }
    const midnight = untilMidnight(this.now(), this.timeZone) + this.timings.wakeSlackMs;
    return Math.max(this.timings.minDelayMs, Math.min(interval, midnight));
  }

  // --- Reading ---------------------------------------------------------------

  /** One reading at a time: a call during a reading waits for it, then reads. */
  poll() {
    const run = async () => {
      try {
        await this.read();
      } finally {
        this.schedule(this.nextDelay());
      }
    };
    this.polling = (this.polling ?? Promise.resolve()).catch(() => {}).then(run);
    return this.polling;
  }

  async read() {
    if (!this.client) {
      await this.publishConnectionStatus();
      return;
    }
    const now = this.now();
    const { client } = this;
    try {
      const households = parseHouseholds(await client.households());
      const answers = await Promise.all(
        households.map((household) =>
          Promise.all([client.shoppingLists(household.id), client.planner(household.id)]),
        ),
      );
      if (client !== this.client) {
        // The configuration changed during the reading: these are the old
        // server's lists; the new one is being read.
        return;
      }
      this.households = households;
      this.lists = households.flatMap((household, index) =>
        parseLists(answers[index][0], household.id),
      );
      this.plans = new Map(
        households.map((household, index) => [household.id, parsePlanner(answers[index][1])]),
      );
      this.readAt = now;
      this.recovered(now);
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.failed(err, now);
    }
    // A new configuration during the publications: stop, the new server is read.
    const current = () => client === this.client;
    if (this.readAt > 0) {
      await this.publishDevices();
      if (!this.error && current()) {
        await this.publishStates();
        if (current()) {
          await this.fireEvents(now);
        }
      }
    }
    if (!current()) {
      return;
    }
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.refreshWidget();
  }

  recovered(now) {
    const host = hostOf(this.config.url);
    if (this.downSince !== null) {
      const minutes = Math.round((now - this.downSince) / 60_000);
      this.resolved('read', `KitchenOwl at ${host} answers again after ${minutes} min`);
    }
    if (!this.connectedLogged) {
      this.connectedLogged = true;
      logger.info(
        `Connected to KitchenOwl at ${host}: ${this.households.length} household(s), ${this.lists.length} shopping list(s)`,
      );
    }
    this.error = null;
    this.downSince = null;
  }

  failed(err, now) {
    const kind = err instanceof KitchenOwlError ? err.kind : ERROR_KINDS.HTTP;
    this.error = { kind, message: err.message };
    this.downSince ??= now;
    this.problem(
      'read',
      `KitchenOwl at ${hostOf(this.config.url)}: ${err.message}`,
      undefined,
      'error',
    );
  }

  /** Today's and tomorrow's meals of a household, in the time zone of Gladys. */
  meals(householdId) {
    const plans = this.plans.get(householdId) ?? [];
    const now = this.now();
    return {
      today: mealsOn(plans, localDate(now, this.timeZone)),
      tomorrow: mealsOn(plans, localDate(now, this.timeZone, 1)),
    };
  }

  householdOf(list) {
    return this.households.find((household) => household.id === list.householdId) ?? null;
  }

  memberName(list, userId) {
    return this.householdOf(list)?.members.get(userId) ?? '';
  }

  /**
   * The list a device stands for: a list device, or a household device (its
   * default list). Empty: the default list of the first household.
   * @returns {object|null|undefined} the list; null for an unknown device;
   *   undefined when there is no list at all
   */
  listOf(externalId) {
    if (!externalId) {
      const first = this.households[0];
      const list =
        this.lists.find((entry) => entry.id === first?.defaultListId) ??
        this.lists.find((entry) => entry.householdId === first?.id) ??
        this.lists[0];
      return list ?? undefined;
    }
    const direct = this.lists.find((list) => listIds(this.gladys, list.id).device === externalId);
    if (direct) {
      return direct;
    }
    const household = this.households.find(
      (entry) => householdIds(this.gladys, entry.id).device === externalId,
    );
    if (!household) {
      return null;
    }
    return (
      this.lists.find((list) => list.id === household.defaultListId) ??
      this.lists.find((list) => list.householdId === household.id) ??
      null
    );
  }

  // --- Publishing to Gladys --------------------------------------------------

  devices() {
    return buildDevices(this.gladys, this.households, this.lists, this.language);
  }

  async publishDevices() {
    const devices = this.devices();
    const signature = JSON.stringify(devices);
    if (signature === this.devicesSignature) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesSignature = signature;
      this.resolved('devices');
    } catch (err) {
      this.problem('devices', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab. */
  async rediscover() {
    this.devicesSignature = null;
    await this.poll();
  }

  /** The user added a device: the states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    this.gladys.forgetPublishedStates?.(device?.external_id);
    // Its transport was sent before it existed too.
    this.transports.delete(device?.external_id);
    await this.publishTransports();
    if (!this.error && this.readAt > 0) {
      await this.publishStates();
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  states() {
    return deviceStates(
      this.gladys,
      this.households,
      this.lists,
      (householdId) => this.meals(householdId),
      this.language,
    );
  }

  async publishStates() {
    try {
      // Only the changes, and every value again after `heartbeatMs`.
      await this.gladys.publishChangedStates(this.states(), {
        heartbeat: this.timings.heartbeatMs,
      });
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async publishTransports() {
    if (this.readAt === 0) {
      return;
    }
    const transport = this.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    const entries = this.devices()
      .map((device) => ({ external_id: device.external_id, transport }))
      .filter((entry) => this.transports.get(entry.external_id) !== entry.transport);
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.urlTyped ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl,
      };
    }
    if (!this.config.token) {
      return { connected: false, message: CONNECTION_TEXT.noToken };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    if (this.readAt > 0 && this.households.length === 0) {
      return { connected: false, message: CONNECTION_TEXT.noHousehold };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  refreshWidget() {
    const signature = JSON.stringify([
      this.error?.kind ?? null,
      this.households.length,
      this.lists,
    ]);
    if (signature !== this.widgetSignature) {
      this.widgetSignature = signature;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  // --- Scene events ----------------------------------------------------------

  async fireEvents(now) {
    const scope = this.config.url;
    const current = Object.fromEntries(
      this.lists.map((list) => [String(list.id), list.items.map(itemKey).slice(-MAX_REMEMBERED)]),
    );
    if (this.saved.scope !== scope) {
      // First reading of this server: what is on the lists is known, not news.
      this.saved = { scope, lists: current };
      this.store.save(this.saved);
      return;
    }
    for (const [key, at] of this.ownAdds) {
      if (now - at > OWN_ADD_MS) {
        this.ownAdds.delete(key);
      }
    }
    const added = [];
    for (const list of this.lists) {
      const before = this.saved.lists[String(list.id)];
      if (!Array.isArray(before)) {
        // A list seen for the first time (created, or a household joined):
        // its items are known, not news.
        continue;
      }
      const known = new Set(before);
      const fresh = list.items
        .filter((item) => !known.has(itemKey(item)))
        .sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
      for (const item of fresh.slice(0, MAX_EVENTS_PER_LIST)) {
        added.push({ list, item });
      }
      if (fresh.length > MAX_EVENTS_PER_LIST) {
        logger.debug(`List #${list.id}: ${fresh.length} items added at once, events capped`);
      }
    }
    if (JSON.stringify(current) !== JSON.stringify(this.saved.lists)) {
      this.saved = { scope, lists: current };
      this.store.save(this.saved);
    }
    for (const { list, item } of added) {
      const own = `${list.id}:${normalizeName(item.name)}`;
      await this.fire(TRIGGERS.ITEM_ADDED, {
        list: listIds(this.gladys, list.id).device,
        list_name: list.name,
        item: item.name,
        description: item.description,
        added_by: item.addedBy === null ? '' : this.memberName(list, item.addedBy),
        // Lets a scene that adds items ignore its own additions (no loop).
        from_gladys: this.ownAdds.has(own),
      });
      this.ownAdds.delete(own);
    }
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Commands --------------------------------------------------------------

  /** A KitchenOwl error turned into a message for the user, in their language. */
  translate(err) {
    if (!(err instanceof KitchenOwlError)) {
      return err;
    }
    const language = this.language;
    if (err.status === 404) {
      return new Error(pick(ACTION_TEXT.unknownList, language), { cause: err });
    }
    const colon = language === 'fr' ? ' : ' : ': ';
    // The status only: the server's own text stays in the logs.
    const status = err.status ? ` (HTTP ${err.status})` : '';
    return new Error(`KitchenOwl${colon}${pick(ERROR_TEXT[err.kind], language)}${status}`, {
      cause: err,
    });
  }

  /**
   * The list of a device (or of a list id, from a widget button), read again now (an item may have been added a
   * second ago, a list created a minute ago).
   */
  async freshList(device, listId) {
    const language = this.language;
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.notConfigured, language));
    }
    if (this.readAt === 0) {
      await this.poll();
    }
    if (this.readAt === 0 && this.error) {
      // Never read: the lists are unknown, not missing. Say why.
      throw new KitchenOwlError(this.error.kind, this.error.message);
    }
    const target = Number.isInteger(listId)
      ? (this.lists.find((entry) => entry.id === listId) ?? null)
      : this.listOf(device || null);
    if (target === undefined) {
      throw new Error(pick(ACTION_TEXT.noList, language));
    }
    if (target === null) {
      throw new Error(pick(ACTION_TEXT.unknownList, language));
    }
    const lists = parseLists(
      await this.client.shoppingLists(target.householdId, RECENT_ITEMS),
      target.householdId,
    );
    const list = lists.find((entry) => entry.id === target.id);
    if (!list) {
      this.poll().catch(() => {});
      throw new Error(pick(ACTION_TEXT.unknownList, language));
    }
    return list;
  }

  /** The counts, the widget and the event follow at once, without holding the answer. */
  async refreshSoon() {
    const refresh = this.poll().catch(() => {});
    let timer;
    await Promise.race([
      refresh,
      new Promise((resolve) => {
        timer = setTimeout(resolve, REFRESH_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
  }

  /**
   * Put an item on a list, by name. Already there (case and accents ignored):
   * nothing is added; a new description replaces the old one.
   * @returns {Promise<{ item: string, list: object, alreadyOnList: boolean }>}
   */
  async addItem({ device, listId, name, description }) {
    const language = this.language;
    const wanted = String(name ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, ITEM_NAME_MAX);
    if (!wanted) {
      throw new Error(pick(ACTION_TEXT.emptyName, language));
    }
    const detail = String(description ?? '')
      .trim()
      .slice(0, DESCRIPTION_MAX);
    let list;
    let result;
    try {
      list = await this.freshList(device, listId);
      const existing = findItem(list, wanted);
      if (existing) {
        if (detail && detail !== existing.description) {
          await this.client.setDescription(list.id, existing.id, detail);
        }
        result = { item: existing.name, list, alreadyOnList: true };
      } else {
        // The catalog name of an item checked off lately ("Œufs" for "oeufs"):
        // KitchenOwl folds ASCII case only, and would create a second item.
        const exact = findRecentName(list, wanted) ?? wanted;
        // Before the request: a reading running meanwhile may see the item
        // first, and the event must still say it came from Gladys.
        this.ownAdds.set(`${list.id}:${normalizeName(exact)}`, this.now());
        await this.client.addItem(list.id, exact, detail);
        result = { item: exact, list, alreadyOnList: false };
      }
    } catch (err) {
      throw this.translate(err);
    }
    logger.info(
      `Item ${result.alreadyOnList ? 'already on' : 'added to'} shopping list #${list.id} from Gladys`,
    );
    await this.refreshSoon();
    return result;
  }

  /**
   * Check an item off a list, by name or by KitchenOwl item id (widget).
   * Not on the list: nothing happens, `removed` is false.
   * @returns {Promise<{ item: string, list: object, removed: boolean }>}
   */
  async removeItem({ device, listId, name, itemId }) {
    const language = this.language;
    if (itemId === undefined && !normalizeName(name)) {
      throw new Error(pick(ACTION_TEXT.emptyName, language));
    }
    let list;
    let item;
    try {
      list = await this.freshList(device, listId);
      item =
        itemId === undefined
          ? findItem(list, name)
          : (list.items.find((entry) => entry.id === itemId) ?? null);
      if (item) {
        await this.client.removeItem(list.id, item.id);
      }
    } catch (err) {
      throw this.translate(err);
    }
    if (!item) {
      this.poll().catch(() => {});
      return { item: String(name ?? '').trim(), list, removed: false };
    }
    logger.info(`Item checked off shopping list #${list.id} from Gladys`);
    await this.refreshSoon();
    return { item: item.name, list, removed: true };
  }

  /** The toast of a command, in the four languages (≤ 200 characters). */
  static resultMessage(kind, item, list) {
    return allLanguages((language) => {
      const render = RESULT_TEXT[language][kind];
      const full = render(item, list.name);
      if (full.length <= 200) {
        return full;
      }
      return render(item.slice(0, 80), list.name.slice(0, 60)).slice(0, 200);
    });
  }

  /** The "Test the connection" action: read now, report. */
  async testConnection() {
    await this.poll();
    const status = this.connectionStatus();
    if (!status.connected) {
      const message = allLanguages((language) =>
        REPORT_TEXT[language].failed(pick(status.message, language)),
      );
      throw new Error(message[this.language]);
    }
    const items = this.lists.reduce((sum, list) => sum + list.items.length, 0);
    return allLanguages((language) =>
      REPORT_TEXT[language].ok(this.households.length, this.lists.length, items),
    );
  }
}
