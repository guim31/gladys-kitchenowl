// -----------------------------------------------------------------------------
// KitchenOwl API client: the calls the integration needs, authenticated by a
// long-lived token (Profile → Sessions → long-lived tokens) in
// `Authorization: Bearer`. Checked against the KitchenOwl source
// (backend/app/controller) and a real server in Docker (tombursch/kitchenowl,
// API version 124, October 2026).
//
//   GET    /api/household                                 households of the token user
//   GET    /api/household/:id/shoppinglist?recent_limit=N lists, items included
//   GET    /api/household/:id/planner                     planned recipes
//   POST   /api/shoppinglist/:id/add-item-by-name         { name, description }
//   POST   /api/shoppinglist/:id/item/:itemId             { description }
//   DELETE /api/shoppinglist/:id/item                     { item_id }
//
// Errors: a missing or refused token is a 401, a malformed or forged one a
// 422 `{ msg }` (flask-jwt-extended); a missing list a 404 in plain text; an
// unknown path too. Answers are never wrapped: a list or an object.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // missing, wrong or revoked token
  NOT_KITCHENOWL: 'not_kitchenowl', // something answers, but not the KitchenOwl API
  REDIRECT: 'redirect', // HTTP redirected to HTTPS, or a login portal
  RATE_LIMIT: 'rate_limit', // 429: a reverse proxy's request limit
  HTTP: 'http', // any other unexpected answer
});

export class KitchenOwlError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.name = 'KitchenOwlError';
    this.kind = kind;
    this.status = status;
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function networkError(err) {
  if (TLS_CODES.has(err.code)) {
    return new KitchenOwlError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  return new KitchenOwlError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}

/** The `msg` of a JSON error answer, if any (a JWT error text, never the token). */
function errorText(body) {
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.msg === 'string' ? parsed.msg.slice(0, 200) : '';
  } catch {
    return '';
  }
}

export class KitchenOwlClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, without trailing slash
   * @param {string} options.token long-lived token
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {Function} [options.request] HTTP seam (src/kitchenowl/http.js)
   */
  constructor({ url, token, insecure = false, request = httpRequest }) {
    this.url = url;
    this.token = token;
    this.insecure = insecure;
    this.request = request;
  }

  async call(path, { method = 'GET', json, auth = true } = {}) {
    let response;
    try {
      response = await this.request(`${this.url}${path}`, {
        method,
        json,
        insecure: this.insecure,
        headers: auth ? { authorization: `Bearer ${this.token}` } : {},
      });
    } catch (err) {
      throw networkError(err);
    }
    const { status, body } = response;
    const isJson = /json/i.test(String(response.headers?.['content-type'] ?? ''));
    if (status === 401 || status === 403 || (status === 422 && isJson && errorText(body))) {
      throw new KitchenOwlError(
        ERROR_KINDS.AUTH,
        `HTTP ${status} ${errorText(body)}`.trim(),
        status,
      );
    }
    if (status === 429) {
      throw new KitchenOwlError(ERROR_KINDS.RATE_LIMIT, 'HTTP 429', status);
    }
    if (status >= 300 && status < 400) {
      throw new KitchenOwlError(ERROR_KINDS.REDIRECT, `HTTP ${status}`, status);
    }
    if (status === 404 && !isJson) {
      // A missing list, or no KitchenOwl at all: the caller knows which.
      throw new KitchenOwlError(ERROR_KINDS.NOT_KITCHENOWL, 'HTTP 404', status);
    }
    if (status < 200 || status >= 300) {
      throw new KitchenOwlError(ERROR_KINDS.HTTP, `HTTP ${status}`, status);
    }
    try {
      return JSON.parse(body);
    } catch {
      // The web app answers its HTML page on the paths it does not know.
      throw new KitchenOwlError(ERROR_KINDS.NOT_KITCHENOWL, `HTTP ${status}, not JSON`, status);
    }
  }

  async households() {
    const answer = await this.call('/api/household');
    if (!Array.isArray(answer)) {
      throw new KitchenOwlError(ERROR_KINDS.NOT_KITCHENOWL, 'Households: not a list', 200);
    }
    return answer;
  }

  /**
   * The lists of a household, their items included, and the last `recent`
   * items checked off (1 to 120: the household catalog seen through them).
   */
  async shoppingLists(householdId, recent = 1) {
    const answer = await this.call(
      `/api/household/${encodeURIComponent(householdId)}/shoppinglist?recent_limit=${recent}`,
    );
    return Array.isArray(answer) ? answer : [];
  }

  async planner(householdId) {
    const answer = await this.call(`/api/household/${encodeURIComponent(householdId)}/planner`);
    return Array.isArray(answer) ? answer : [];
  }

  /**
   * Add an item by name. KitchenOwl reuses the household item of that name
   * (ASCII case ignored) and does nothing when it is already on the list.
   */
  addItem(listId, name, description = '') {
    return this.call(`/api/shoppinglist/${encodeURIComponent(listId)}/add-item-by-name`, {
      method: 'POST',
      json: { name, description },
    });
  }

  /** Set the description of an item that is on the list. */
  setDescription(listId, itemId, description) {
    return this.call(
      `/api/shoppinglist/${encodeURIComponent(listId)}/item/${encodeURIComponent(itemId)}`,
      { method: 'POST', json: { description } },
    );
  }

  /** Check an item off (it goes to the "recent items" of the list). */
  removeItem(listId, itemId) {
    return this.call(`/api/shoppinglist/${encodeURIComponent(listId)}/item`, {
      method: 'DELETE',
      json: { item_id: itemId },
    });
  }
}
