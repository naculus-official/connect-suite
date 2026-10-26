# appkit-popover

- The element in the `trigger` slot gets `aria-haspopup="dialog"` and
  `aria-expanded`, kept in sync with the open state (including the `open`
  prop). Slot a real `<button>`.
- Escape closes the popover and, when focus was inside it or on its trigger,
  returns focus to the trigger. A click outside closes it and leaves focus
  where it went.

<!-- Auto Generated Below -->


## Properties

| Property    | Attribute   | Description | Type                                     | Default    |
| ----------- | ----------- | ----------- | ---------------------------------------- | ---------- |
| `open`      | `open`      |             | `boolean`                                | `false`    |
| `placement` | `placement` |             | `"bottom" \| "left" \| "right" \| "top"` | `"bottom"` |


## Events

| Event              | Description | Type                   |
| ------------------ | ----------- | ---------------------- |
| `appkitOpenChange` |             | `CustomEvent<boolean>` |


## Slots

| Slot        | Description      |
| ----------- | ---------------- |
|             | The default slot |
| `"trigger"` |                  |


----------------------------------------------

*Built with [StencilJS](https://stenciljs.com/)*
