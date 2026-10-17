# KitchenOwl for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings the shopping lists and the meal plan of a self-hosted
[KitchenOwl](https://kitchenowl.org) into Gladys, over the local network: how
many items are left to buy, today's and tomorrow's meals, a scene that reacts
when an item is put on a list, and a tap to add or check off an item.

> **Feedback welcome.** The integration was checked against a real KitchenOwl
> server (Docker image `tombursch/kitchenowl`, API version 124, October 2026),
> but not yet in everyday use with a real Gladys. Please report what works and
> what does not in the [issues](https://github.com/guim31/gladys-kitchenowl/issues).

## Features

- **One device per shopping list**, with the number of _items to buy_, and
  **one device per household** with _today's meals_ and _tomorrow's meals_
  (texts: the recipes planned that day in the time zone of Gladys, "Nothing
  planned" otherwise). Feature names in French by default (English, German
  and Spanish available).
- **Dashboard widget** "Shopping list": the count, the items with their
  description, an **Add** button (a form: item, description), a **Check off**
  button (a form listing the items) and a one-tap check for the first two
  items.
- **Scene trigger** _Item added to a KitchenOwl list_: in KitchenOwl or from
  Gladys, never for the items already there at start, remembered across
  restarts; filters on the list and the item name; who added it, and whether
  it came from Gladys (no loops).
- **Scene actions** _Add to a KitchenOwl list_ (never twice, case and accents
  ignored; the description is updated) and _Check off a KitchenOwl item_.
- A **Test the connection** button, a connection status that names the
  problem (token refused, no KitchenOwl at this address, certificate…), and a
  transport badge per device.
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.2.0** or later (forms on widget buttons).
- A **self-hosted KitchenOwl**, reachable from Gladys, and a **long-lived
  token** of one of its users (KitchenOwl → profile → Sessions → Long-lived
  tokens). Items are added and checked off as this user. The hosted
  `app.kitchenowl.org` serves the same API, but was not tested.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-kitchenowl`
   (or install **KitchenOwl** from the catalog once it is listed).
2. In **Configuration**, enter the address of KitchenOwl
   (`http://192.168.1.20:8080`, `https://owl.example.org`…) and the
   long-lived token. Save, then click **Test the connection**.
3. Open the **Discover** tab and add the devices.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

The integration uses the REST API of the KitchenOwl app, with the long-lived
token in `Authorization: Bearer` (routes read in the KitchenOwl source and
checked on a real server):

| Request                                                   | Use                                      |
| --------------------------------------------------------- | ---------------------------------------- |
| `GET /api/household`                                      | households, default list, member names   |
| `GET /api/household/{id}/shoppinglist`                    | the lists of a household, items included |
| `GET /api/household/{id}/planner`                         | planned recipes and their day            |
| `POST /api/shoppinglist/{id}/add-item-by-name`            | add an item                              |
| `POST /api/shoppinglist/{id}/item/{itemId}`               | update the description of an item        |
| `DELETE /api/shoppinglist/{id}/item` with `{ "item_id" }` | check an item off                        |

KitchenOwl is read on a timer of the container (30 s to 5 minutes, 1 minute
by default, plus local midnight for the meals); the devices are published
with `should_poll: false`. One reading is one request for the households and
two per household. States are published only when they change, and every 12
hours otherwise. The items already seen on each list are kept in
`/data/kitchenowl-state.json`, so that a restart neither announces them again
nor misses one added meanwhile.

## Checked on a real KitchenOwl, and what was not

Checked against `tombursch/kitchenowl` (image of 17/10/2026, API 124, SQLite)
in a Docker network, from the integration's own image started with the
constraints of the Gladys sandbox (read-only rootfs, `--cap-drop ALL`,
256 MB), with the SDK's fake Gladys:

- account, household, two lists, items and planned recipes created through
  the API; the answers are the fixtures of `test/fixtures/kitchenowl/`;
- devices, states (counts, today's and tomorrow's meals), "Test the
  connection";
- adding an item (new, already there, `oeufs` for `Œufs`, on another list),
  an item added directly in KitchenOwl firing the trigger with its
  description and author, the widget content and its three kinds of buttons,
  checking off by name and an absent item;
- a malformed token and a forged one (422), a web page instead of the API,
  an address that does not answer;
- without Gladys, the container retries the connection without crashing or
  logging a secret; about 21 MB of memory at rest.

Not checked: a real Gladys (the widget forms need Gladys 5.2.0), the hosted
`app.kitchenowl.org`, a revoked token (expected to be a 401), and the exact
wording of the token screen in the KitchenOwl app.

## Limitations

- Polling, not the real-time channel of KitchenOwl: an item added in
  KitchenOwl reaches Gladys within the refresh interval.
- The meal plan is read only; recipes and expenses are not used.
- Twenty "item added" events per list and per reading at most.
- The "Check off" form lists the first 50 items of a list.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory KitchenOwl (`test/helpers/fakeKitchenOwl.js`) built from real
answers. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [KitchenOwl](https://github.com/TomBursch/kitchenowl) by Tom Bursch and its
  contributors (AGPL-3.0): the routes and their behavior were read in its
  source; no code was copied, the integration only talks to its API.
- The architecture and the conformity tests follow
  [gladys-donetick](https://github.com/guim31/gladys-donetick) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by KitchenOwl. The
cover is an original illustration, without the KitchenOwl logo.

## License

Apache-2.0
