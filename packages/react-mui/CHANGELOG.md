# @texaryn/react-mui

## 0.1.2

### Patch Changes

- f0ab713: `MuiSelect` no longer sets `aria-invalid` on MUI's native input. That element carries `aria-hidden="true"` and `tabindex="-1"`, so the attribute was never reachable by assistive technology. The invalid state was already correct and remains so: for a Select, MUI puts `aria-invalid` on the `role="combobox"` element from the `error` prop, and omits it entirely while valid. No rendered behaviour changes.

## 0.1.1

### Patch Changes

- Updated dependencies [cd13f98]
- Updated dependencies [3172a01]
  - @texaryn/core@0.3.0
  - @texaryn/react@0.2.2

## 0.1.0

### Minor Changes

- 7778ff2: First release: Material UI v9 widgets for Texaryn. `createMuiRegistry()` renders MUI TextField, Checkbox, MenuItem, FormControl, Stack, and Button components on top of `@texaryn/react`. The package expects MUI v9 and its styling engine on the page and never loads them itself.

### Patch Changes

- eb1ae23: `MuiSelect` now sets `aria-required` on the element that exposes `role="combobox"`. It previously landed on MUI's native input, which carries `aria-hidden="true"` and `tabindex="-1"`, so assistive technology never saw the required state.
