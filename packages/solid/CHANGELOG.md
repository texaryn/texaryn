# @texaryn/solid

## 0.3.0

### Minor Changes

- 3e79b3e: FormRoot now renders the UI tree without creating a native form. Consumers own
  the form element and connect its submit event to the runtime.
- 3e79b3e: Give every renderer one localized validation message contract and normalize
  adapter parameters so built-in widgets do not display evaluator diagnostics.

### Patch Changes

- Updated dependencies [35cb55f]
- Updated dependencies [3e79b3e]
  - @texaryn/core@0.16.0

## 0.2.0

### Minor Changes

- 2c2786f: Add a standalone version 2 display document runtime, semantic renderer roots, bounded server update sessions, and validated host action arguments.
- 2c2786f: Add native drag reorder to every array renderer while retaining the existing accessible move controls.

### Patch Changes

- Updated dependencies [2c2786f]
- Updated dependencies [2c2786f]
  - @texaryn/core@0.15.0

## 0.1.0

Initial SolidJS renderer package.
