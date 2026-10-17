// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// `add_item`: put an item on a shopping list, by name — "the milk is
// finished" said to the voice assistant, the last capsule of the coffee
// machine, an NFC tag on the cupboard. Never twice: an item already on the
// list stays alone (its description is updated).
// `remove_item`: check an item off, by name — bought on the way home, or
// the robot found some in the fridge after all.
// The list is a device of the integration (a household device stands for its
// default list); empty, the default list of the first household. The fields
// are strings, so a scene variable fits too (`{{triggerEvent.data.item}}`).
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async add_item(hub, { fields = {} }) {
    const { item, list, alreadyOnList } = await hub.addItem({
      device: fields.list,
      name: fields.item,
      description: fields.description,
    });
    return { item, list_name: list.name, already_on_list: alreadyOnList };
  },

  async remove_item(hub, { fields = {} }) {
    const { item, list, removed } = await hub.removeItem({
      device: fields.list,
      name: fields.item,
    });
    return { item, list_name: list.name, removed };
  },
};
