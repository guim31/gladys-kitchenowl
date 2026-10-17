// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.2+): `shopping_list`.
//
// The use case: the kitchen tablet shows what is left to buy, a tap checks an
// item off, another one adds what just ran out, without opening KitchenOwl.
// The list is chosen in the widget settings (a list device, or a household
// device for its default list); empty, the default list of the first
// household.
//
// Budget (8 components, 6 tiles, 1 status, 4 buttons, 2 texts): one tile (the
// count), one status list (the items, with their description), and four
// buttons: "Add" (a form: name and description), "Check off" (a form listing
// the items) and a direct "check" for the first two items. The figures are
// values, not bound to device features, so the widget works before any device
// is added to Gladys. Forms on widget buttons came with Gladys 5.2.0 (#3168).
// -----------------------------------------------------------------------------

import { KitchenOwlHub, WIDGET_KEY } from './hub.js';
import { ERROR_KINDS } from './kitchenowl/client.js';
import { ERROR_TEXT, pick } from './texts.js';

// Action keys of the buttons: permanent once published (unique, the core
// drops a button whose key is taken).
export const ACTIONS = Object.freeze({
  ADD: 'add',
  CHECK: 'check',
  CHECK_FIRST: ['check_1', 'check_2'],
});
const MAX_ROWS = 10;
// Items offered in the "Check off" form.
const MAX_OPTIONS = 50;

export const TEXT = {
  configure: {
    en: 'Enter the address of your KitchenOwl and a long-lived token in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre KitchenOwl et un jeton longue durée dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines KitchenOwl und ein langlebiges Token in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su KitchenOwl y un token de larga duración en la configuración de la integración.',
  },
  unknown: {
    en: 'This shopping list no longer exists in KitchenOwl: choose another device in the widget settings.',
    fr: "Cette liste de courses n'existe plus dans KitchenOwl : choisissez un autre appareil dans les réglages du widget.",
    de: 'Diese Einkaufsliste gibt es in KitchenOwl nicht mehr: Wähle ein anderes Gerät in den Widget-Einstellungen.',
    es: 'Esta lista de la compra ya no existe en KitchenOwl: elija otro dispositivo en la configuración del widget.',
  },
  noList: {
    en: 'No shopping list in KitchenOwl yet.',
    fr: 'Aucune liste de courses dans KitchenOwl pour le moment.',
    de: 'Noch keine Einkaufsliste in KitchenOwl.',
    es: 'Todavía no hay ninguna lista de la compra en KitchenOwl.',
  },
  noAnswer: {
    en: 'KitchenOwl does not answer: see the Configuration screen of the integration.',
    fr: "KitchenOwl ne répond pas : voir l'écran Configuration de l'intégration.",
    de: 'KitchenOwl antwortet nicht: Sieh dir die Konfiguration der Integration an.',
    es: 'KitchenOwl no responde: consulte la pantalla de configuración de la integración.',
  },
  stale: {
    en: 'KitchenOwl does not answer: last known list.',
    fr: 'KitchenOwl ne répond pas : dernière liste connue.',
    de: 'KitchenOwl antwortet nicht: zuletzt bekannte Liste.',
    es: 'KitchenOwl no responde: última lista conocida.',
  },
  empty: {
    en: 'The list is empty.',
    fr: 'La liste est vide.',
    de: 'Die Liste ist leer.',
    es: 'La lista está vacía.',
  },
  toBuy: { en: 'To buy', fr: 'À acheter', de: 'Zu kaufen', es: 'Por comprar' },
  more: { en: 'More items', fr: 'Autres articles', de: 'Weitere Artikel', es: 'Más artículos' },
  add: { en: 'Add', fr: 'Ajouter', de: 'Hinzufügen', es: 'Añadir' },
  check: { en: 'Check off', fr: 'Cocher', de: 'Abhaken', es: 'Marcar' },
  item: { en: 'Item', fr: 'Article', de: 'Artikel', es: 'Artículo' },
  description: {
    en: 'Description (quantity…)',
    fr: 'Description (quantité…)',
    de: 'Beschreibung (Menge…)',
    es: 'Descripción (cantidad…)',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

function itemRow(item) {
  return {
    label: fit(item.name, 40),
    icon: 'shopping-cart',
    value: item.description ? fit(item.description, 40) : '—',
  };
}

function rows(items, language) {
  if (items.length <= MAX_ROWS) {
    return items.map(itemRow);
  }
  return [
    ...items.slice(0, MAX_ROWS - 1).map(itemRow),
    { label: t(TEXT.more, language), icon: 'more-horizontal', value: items.length - MAX_ROWS + 1 },
  ];
}

function addButton(list, language) {
  return {
    type: 'button',
    label: t(TEXT.add, language),
    icon: 'plus',
    style: 'secondary',
    action: {
      key: ACTIONS.ADD,
      params: { list: list.id },
      fields: [
        { key: 'name', type: 'string', required: true, label: TEXT.item },
        { key: 'description', type: 'string', required: false, label: TEXT.description },
      ],
    },
  };
}

function checkButton(list, language) {
  return {
    type: 'button',
    label: t(TEXT.check, language),
    icon: 'check-square',
    style: 'secondary',
    action: {
      key: ACTIONS.CHECK,
      params: { list: list.id },
      fields: [
        {
          key: 'item',
          type: 'select',
          required: true,
          label: TEXT.item,
          options: list.items.slice(0, MAX_OPTIONS).map((item) => ({
            value: String(item.id),
            label: { en: fit(item.name, 40) },
          })),
        },
      ],
    },
  };
}

async function get(hub, { settings, language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.configure, language);
  }
  if (hub.error && hub.readAt === 0) {
    return message(TEXT.noAnswer, language);
  }
  const list = hub.listOf(settings?.device || null);
  if (list === undefined) {
    return message(TEXT.noList, language);
  }
  if (list === null) {
    return message(TEXT.unknown, language);
  }
  const components = [];
  if (hub.error) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: fit(
        hub.error.kind === ERROR_KINDS.UNREACHABLE
          ? t(TEXT.stale, language)
          : `KitchenOwl${language === 'fr' ? ' : ' : ': '}${t(ERROR_TEXT[hub.error.kind], language)}`,
        80,
      ),
    });
  }
  components.push({
    type: 'value',
    value: list.items.length,
    label: fit(list.name, 24),
    icon: 'shopping-cart',
  });
  if (list.items.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.empty, language) });
  } else {
    components.push({ type: 'status', items: rows(list.items, language) });
  }
  if (!hub.error) {
    components.push(addButton(list, language));
    if (list.items.length > 0) {
      components.push(checkButton(list, language));
    }
    // The item name travels with the button: a tap on a stale widget checks
    // off nothing else than the item it shows.
    list.items.slice(0, ACTIONS.CHECK_FIRST.length).forEach((item, index) => {
      components.push({
        type: 'button',
        label: fit(item.name, 24),
        icon: 'check',
        style: 'secondary',
        action: {
          key: ACTIONS.CHECK_FIRST[index],
          params: { list: list.id, item: item.id, name: item.name },
        },
      });
    });
  }
  return { ttl_seconds: 300, components };
}

async function action(hub, { actionKey, params = {}, values = {} }) {
  if (!Number.isInteger(params.list)) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  if (actionKey === ACTIONS.ADD) {
    const result = await hub.addItem({
      listId: params.list,
      name: values.name,
      description: values.description,
    });
    return {
      message: KitchenOwlHub.resultMessage(
        result.alreadyOnList ? 'already' : 'added',
        result.item,
        result.list,
      ),
    };
  }
  let itemId;
  let name;
  if (actionKey === ACTIONS.CHECK) {
    itemId = Number(values.item);
    name = '';
  } else if (ACTIONS.CHECK_FIRST.includes(actionKey)) {
    itemId = params.item;
    name = typeof params.name === 'string' ? params.name : '';
  }
  if (!Number.isInteger(itemId)) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  const result = await hub.removeItem({ listId: params.list, itemId, name });
  return {
    message: KitchenOwlHub.resultMessage(
      result.removed ? 'removed' : 'absent',
      result.item || name || `#${itemId}`,
      result.list,
    ),
  };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
