// -----------------------------------------------------------------------------
// Gladys devices: one per KitchenOwl shopping list, and one per household for
// its meal plan.
//
// Identity: the ids KitchenOwl gives (stable, never a name):
// `shopping_list` / `list-<id>` and `household` / `household-<id>`. A token
// of another user of the same household keeps the same devices.
//
// Features (category/type couples of the core table, test/gladys-rules.test.js):
//   - list: items to buy, counter-sensor/integer;
//   - household: today's and tomorrow's meals, text/text (the recipe names,
//     "Nothing planned" otherwise: a text state is never empty).
//
// The devices are published with should_poll: false: the integration reads
// KitchenOwl on its own timer (src/hub.js), every 30 s to 5 minutes.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const LIST_TYPE = 'shopping_list';
export const HOUSEHOLD_TYPE = 'household';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ITEMS: 'items',
  MEALS_TODAY: 'meals_today',
  MEALS_TOMORROW: 'meals_tomorrow',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.ITEMS]: 'Items to buy',
    [FEATURE_KEYS.MEALS_TODAY]: "Today's meals",
    [FEATURE_KEYS.MEALS_TOMORROW]: "Tomorrow's meals",
  },
  fr: {
    [FEATURE_KEYS.ITEMS]: 'Articles à acheter',
    [FEATURE_KEYS.MEALS_TODAY]: 'Repas du jour',
    [FEATURE_KEYS.MEALS_TOMORROW]: 'Repas de demain',
  },
  de: {
    [FEATURE_KEYS.ITEMS]: 'Zu kaufende Artikel',
    [FEATURE_KEYS.MEALS_TODAY]: 'Heutige Mahlzeiten',
    [FEATURE_KEYS.MEALS_TOMORROW]: 'Morgige Mahlzeiten',
  },
  es: {
    [FEATURE_KEYS.ITEMS]: 'Artículos por comprar',
    [FEATURE_KEYS.MEALS_TODAY]: 'Comidas de hoy',
    [FEATURE_KEYS.MEALS_TOMORROW]: 'Comidas de mañana',
  },
};

// Published on a meal feature when nothing is planned that day.
export const NO_MEAL = {
  en: 'Nothing planned',
  fr: 'Rien de prévu',
  de: 'Nichts geplant',
  es: 'Nada previsto',
};

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 1000;
const TEXT_MAX_LENGTH = 100;
const NAME_MAX_LENGTH = 60;

const COUNTER = {
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  min: 0,
  max: COUNTER_MAX,
};

const TEXT = {
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  read_only: true,
  has_feedback: false,
  keep_history: false,
  // NOT NULL in the core, even for a text (422 on "Add to Gladys" otherwise).
  min: 0,
  max: 0,
};

export const listIds = (gladys, listId) => gladys.externalIds(LIST_TYPE, `list-${listId}`);
export const householdIds = (gladys, householdId) =>
  gladys.externalIds(HOUSEHOLD_TYPE, `household-${householdId}`);

const fit = (value, max) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

function feature(ids, key, definition, language) {
  const names = NAMES[language] ?? NAMES.en;
  return { ...definition, name: names[key], external_id: ids.feature(key) };
}

/**
 * Every device of the server: the lists first, by household, then the
 * households. Names are made distinct (a household name is added when there
 * are several households, the id when two lists share a name).
 * @param {object} gladys
 * @param {Array} households parsed households (src/kitchenowl/model.js)
 * @param {Array} lists parsed lists of every household
 * @param {string} language
 */
export function buildDevices(gladys, households, lists, language = 'en') {
  const several = households.length > 1;
  const householdName = new Map(households.map((household) => [household.id, household.name]));
  const wanted = [
    ...lists.map((list) => ({
      name: several
        ? `KitchenOwl ${householdName.get(list.householdId) ?? ''} ${list.name}`
        : `KitchenOwl ${list.name}`,
      id: list.id,
      device: {
        external_id: listIds(gladys, list.id).device,
        should_poll: false,
        features: [feature(listIds(gladys, list.id), FEATURE_KEYS.ITEMS, COUNTER, language)],
      },
    })),
    ...households.map((household) => {
      const ids = householdIds(gladys, household.id);
      return {
        name: `KitchenOwl ${household.name}`,
        id: household.id,
        device: {
          external_id: ids.device,
          should_poll: false,
          features: [
            feature(ids, FEATURE_KEYS.MEALS_TODAY, TEXT, language),
            feature(ids, FEATURE_KEYS.MEALS_TOMORROW, TEXT, language),
          ],
        },
      };
    }),
  ];
  const seen = new Set();
  return wanted.map(({ name, id, device }) => {
    let unique = fit(name.replace(/\s+/g, ' ').trim(), NAME_MAX_LENGTH);
    if (seen.has(unique)) {
      const suffix = ` #${id}`;
      unique = `${fit(unique, NAME_MAX_LENGTH - suffix.length)}${suffix}`;
    }
    seen.add(unique);
    return { name: unique, ...device };
  });
}

/** The text of a meal feature: the recipe names, or "Nothing planned". */
export function mealsText(meals, language) {
  if (meals.length === 0) {
    return NO_MEAL[language] ?? NO_MEAL.en;
  }
  return fit(meals.join(', '), TEXT_MAX_LENGTH);
}

/**
 * The states of every device, in the `publishStates` format.
 * @param {object} gladys
 * @param {Array} households
 * @param {Array} lists
 * @param {(householdId: number) => { today: string[], tomorrow: string[] }} meals
 * @param {string} language
 */
export function deviceStates(gladys, households, lists, meals, language) {
  const states = lists.map((list) => ({
    device_feature_external_id: listIds(gladys, list.id).feature(FEATURE_KEYS.ITEMS),
    state: Math.min(list.items.length, COUNTER_MAX),
  }));
  for (const household of households) {
    const ids = householdIds(gladys, household.id);
    const { today, tomorrow } = meals(household.id);
    states.push(
      {
        device_feature_external_id: ids.feature(FEATURE_KEYS.MEALS_TODAY),
        text: mealsText(today, language),
      },
      {
        device_feature_external_id: ids.feature(FEATURE_KEYS.MEALS_TOMORROW),
        text: mealsText(tomorrow, language),
      },
    );
  }
  return states;
}
