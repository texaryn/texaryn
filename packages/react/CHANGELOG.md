# @texaryn/react

## 0.2.2

### Patch Changes

- Updated dependencies [cd13f98]
- Updated dependencies [3172a01]
  - @texaryn/core@0.3.0

## 0.2.1

### Patch Changes

- 01f6065: Depend on `@texaryn/core` through a caret range rather than an exact version. The previous exact pin made each release usable only against the single `@texaryn/core` build it shipped beside, which forced all three packages to move together. They now version independently, so a version describes that package's own public contract.

## 0.2.0

### Minor Changes

- 6c4fee1: Add `useFieldBinding(node)`, the composition layer for custom widgets: semantic value and `setValue`, label, description, placeholder, display-gated errors, ARIA prop getters, and two event-shaped DOM adapters, `domInputProps` for text, number, textarea and select controls and `domCheckboxProps` for checkboxes, which own display value and coercion. The default field widgets are rebuilt on it with unchanged behaviour.

### Patch Changes

- f223cf9: Apply the `helpText` UI hint. The compiler carries it onto the field node and the default widgets render it as the field description, taking precedence over the schema `description`, with `aria-describedby` linking the input to it. `colSpan` is marked deprecated: it has never been applied and will be removed or replaced once Texaryn has a layout contract. `hidden` is documented as not applied yet.
- Updated dependencies [f223cf9]
  - @texaryn/core@0.2.0

## 0.1.2

### Patch Changes

- 25cb16e: Add focused npm search keywords and GitHub Sponsors funding metadata to the public packages.
- Updated dependencies [25cb16e]
  - @texaryn/core@0.1.2

## 0.1.1

### Patch Changes

- 9bcc0b2: Apply the `placeholder` UI hint. The compiler now carries it onto the field node and `getInputProps` emits it, so text, number and textarea widgets render the placeholder that the hint has documented since the first alpha.
- Updated dependencies [9bcc0b2]
  - @texaryn/core@0.1.1

## 0.1.0

### Minor Changes

- afa1f81: Add display-policy-aware error presentation. Core runtime computes `showErrors` per node (`touched && invalid`) and maintains a reactive `visibleErrors` aggregate. React prop getters set `aria-invalid` and error-linked `aria-describedby` only when `showErrors` is true. New `FieldErrors` component replaces inline error rendering in all default widgets. New standalone `ErrorSummary` component subscribes to `visibleErrors`.
- 18f74ea: First public alpha: JSON Schema to React form pipeline.
  
  Schema evaluation, IR compiler, headless runtime, React bindings, default widgets, and prop getters.

### Patch Changes

- Updated dependencies [afa1f81]
- Updated dependencies [e8807f4]
- Updated dependencies [65d58b2]
- Updated dependencies [18f74ea]
  - @texaryn/core@0.1.0

## 0.1.0-alpha.0

### Minor Changes

- 18f74ea: First public alpha: JSON Schema to React form pipeline.
  
  Schema evaluation, IR compiler, headless runtime, React bindings, default widgets, and prop getters.

### Patch Changes

- Updated dependencies [18f74ea]
  - @texaryn/core@0.1.0-alpha.0
