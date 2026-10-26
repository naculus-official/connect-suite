# appkit-input



<!-- Auto Generated Below -->


## Properties

| Property       | Attribute      | Description                | Type                  | Default     |
| -------------- | -------------- | -------------------------- | --------------------- | ----------- |
| `autocomplete` | `autocomplete` | Autocomplete hint          | `string`              | `"off"`     |
| `disabled`     | `disabled`     | Disable input              | `boolean`             | `false`     |
| `invalid`      | `invalid`      | Invalid state              | `boolean`             | `false`     |
| `maxLength`    | `max-length`   | Max character length       | `number \| undefined` | `undefined` |
| `name`         | `name`         | Name attribute (for forms) | `string`              | `""`        |
| `placeholder`  | `placeholder`  | Placeholder text           | `string`              | `""`        |
| `type`         | `type`         | Input type                 | `string`              | `"text"`    |
| `value`        | `value`        | Current value              | `string`              | `""`        |


## Events

| Event          | Description | Type                  |
| -------------- | ----------- | --------------------- |
| `appkitChange` |             | `CustomEvent<string>` |


## Dependencies

### Used by

 - [appkit-connect-button](../connect-button)

### Graph
```mermaid
graph TD;
  appkit-connect-button --> appkit-input
  style appkit-input fill:#f9f,stroke:#333,stroke-width:4px
```

----------------------------------------------

*Built with [StencilJS](https://stenciljs.com/)*
