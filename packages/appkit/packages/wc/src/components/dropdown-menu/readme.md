# appkit-dropdown-menu

Follows the WAI-ARIA Menu Button pattern.

- The element in the `trigger` slot gets `aria-haspopup="menu"` and
  `aria-expanded`, kept in sync with the open state. Slot a real `<button>`.
- Opening moves focus to the first enabled item (ArrowUp on the closed
  trigger: the last). ArrowUp / ArrowDown / Home / End move focus between
  items, skipping separators and disabled items.
- Escape or choosing an item closes the menu and returns focus to the
  trigger; Tab or a click outside closes it and leaves focus where it went.

<!-- Auto Generated Below -->


## Properties

| Property    | Attribute    | Description               | Type     | Default |
| ----------- | ------------ | ------------------------- | -------- | ------- |
| `itemsJson` | `items-json` | JSON string of MenuItem[] | `string` | `"[]"`  |


## Events

| Event          | Description | Type                  |
| -------------- | ----------- | --------------------- |
| `appkitSelect` |             | `CustomEvent<string>` |


## Slots

| Slot        | Description |
| ----------- | ----------- |
| `"trigger"` |             |


----------------------------------------------

*Built with [StencilJS](https://stenciljs.com/)*
