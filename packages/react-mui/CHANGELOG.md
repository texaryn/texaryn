# @texaryn/react-mui

## 0.1.0

### Minor Changes

- 7778ff2: First release: Material UI v9 widgets for Texaryn. `createMuiRegistry()` renders MUI TextField, Checkbox, MenuItem, FormControl, Stack, and Button components on top of `@texaryn/react`. The package expects MUI v9 and its styling engine on the page and never loads them itself.

### Patch Changes

- eb1ae23: `MuiSelect` now sets `aria-required` on the element that exposes `role="combobox"`. It previously landed on MUI's native input, which carries `aria-hidden="true"` and `tabindex="-1"`, so assistive technology never saw the required state.
