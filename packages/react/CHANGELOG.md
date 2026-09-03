# @texaryn/react

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
