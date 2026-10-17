// -----------------------------------------------------------------------------
// The KitchenOwl answers, reduced to what the integration uses. Pure
// functions: tested on real answers (test/fixtures/kitchenowl/).
//
// Dates are epoch milliseconds. A planned recipe has a `cooking_date` at UTC
// midnight of its calendar day (the server stores a naive date): it is a day,
// not an instant, compared with the local day of Gladys as `YYYY-MM-DD`. A
// recipe planned "some day" has the date 0001-01-01 (-62135596800000).
// -----------------------------------------------------------------------------

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const int = (value) => (Number.isInteger(value) ? value : null);

/** @returns {{ id: number, name: string, defaultListId: number|null, members: Map<number, string> }[]} */
export function parseHouseholds(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((household) => int(household?.id) !== null)
    .map((household) => ({
      id: household.id,
      name: text(household.name) || `#${household.id}`,
      defaultListId: int(household.default_shopping_list?.id),
      members: new Map(
        (Array.isArray(household.member) ? household.member : [])
          .filter((member) => int(member?.id) !== null)
          .map((member) => [member.id, text(member.name) || text(member.username)]),
      ),
    }))
    .sort((a, b) => a.id - b.id);
}

/**
 * @returns {{ id: number, householdId: number, name: string,
 *   items: { id: number, name: string, description: string, addedAt: number|null, addedBy: number|null }[] }[]}
 */
export function parseLists(raw, householdId) {
  return (Array.isArray(raw) ? raw : [])
    .filter((list) => int(list?.id) !== null)
    .map((list) => ({
      id: list.id,
      householdId,
      name: text(list.name) || `#${list.id}`,
      items: (Array.isArray(list.items) ? list.items : [])
        .filter((item) => int(item?.id) !== null && text(item.name))
        .map((item) => ({
          id: item.id,
          name: text(item.name),
          description: text(item.description),
          addedAt: Number.isFinite(item.created_at) ? item.created_at : null,
          addedBy: int(item.created_by),
        })),
    }))
    .sort((a, b) => a.id - b.id);
}

/** @returns {{ day: string|null, recipe: string, recipeId: number|null }[]} */
export function parsePlanner(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((plan) => text(plan?.recipe?.name))
    .map((plan) => {
      const at = plan.cooking_date;
      // Before year 1000: the "some day" plans, never a day of the calendar.
      const dated = Number.isFinite(at) && at > Date.UTC(1000, 0, 1);
      return {
        day: dated ? new Date(at).toISOString().slice(0, 10) : null,
        recipe: text(plan.recipe.name),
        recipeId: int(plan.recipe_id ?? plan.recipe.id),
      };
    });
}

/** A time zone Intl accepts, UTC otherwise. */
export function resolveTimeZone(zone) {
  if (typeof zone === 'string' && zone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return zone;
    } catch {
      // fall through
    }
  }
  return 'UTC';
}

/** The local calendar day of an instant, `YYYY-MM-DD`, shifted by `offset` days. */
export function localDate(ms, timeZone, offset = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  const day = new Date(Date.UTC(get('year'), get('month') - 1, get('day') + offset));
  return day.toISOString().slice(0, 10);
}

/** Milliseconds until the next local midnight (DST included), at least 1 s. */
export function untilMidnight(ms, timeZone) {
  const today = localDate(ms, timeZone);
  // Walk forward by the hour, then by the minute: robust to 23 h and 25 h
  // days and to half-hour offsets.
  let probe = ms - (ms % 60_000);
  while (localDate(probe + 60 * 60_000, timeZone) === today) {
    probe += 60 * 60_000;
  }
  while (localDate(probe, timeZone) === today) {
    probe += 60_000;
  }
  return Math.max(1000, probe - ms);
}

/** The recipe names planned on a calendar day, in planner order, no repeat. */
export function mealsOn(plans, day) {
  return [...new Set(plans.filter((plan) => plan.day === day).map((plan) => plan.recipe))];
}

/** Lower case, no accent, single spaces: how names are compared. */
export function normalizeName(value) {
  return text(String(value ?? ''))
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** The item of a list with this name (case and accents ignored), or null. */
export function findItem(list, name) {
  const wanted = normalizeName(name);
  if (!wanted || !list) {
    return null;
  }
  return list.items.find((item) => normalizeName(item.name) === wanted) ?? null;
}

/** The key of an item on a list: a new key each time it is put on the list again. */
export const itemKey = (item) => `${item.id}@${item.addedAt ?? 0}`;
