# @texaryn/core

## 0.1.2

### Patch Changes

- 25cb16e: Add focused npm search keywords and GitHub Sponsors funding metadata to the public packages.

## 0.1.1

### Patch Changes

- 9bcc0b2: Apply the `placeholder` UI hint. The compiler now carries it onto the field node and `getInputProps` emits it, so text, number and textarea widgets render the placeholder that the hint has documented since the first alpha.

## 0.1.0

### Minor Changes

- afa1f81: Add display-policy-aware error presentation. Core runtime computes `showErrors` per node (`touched && invalid`) and maintains a reactive `visibleErrors` aggregate. React prop getters set `aria-invalid` and error-linked `aria-describedby` only when `showErrors` is true. New `FieldErrors` component replaces inline error rendering in all default widgets. New standalone `ErrorSummary` component subscribes to `visibleErrors`.
- 65d58b2: Add automatic validation triggered by blur, change, and submit hints with configurable debounce, epoch-based stale result protection, and submission race handling.
- 18f74ea: First public alpha: JSON Schema to React form pipeline.
  
  Schema evaluation, IR compiler, headless runtime, React bindings, default widgets, and prop getters.

### Patch Changes

- e8807f4: Add submission lifecycle with snapshot semantics.
  Submit captures the current form data as an immutable attempt. Validation
  and onSubmit both operate on the captured snapshot, not live state.
  Duplicate Submit while validating or submitting is a no-op. Edits during
  submitting update the form but do not alter the in-flight payload or
  trigger blur/change validation. Reset or destroy during an in-flight
  submission cleanly cancels via a generation counter.

## 0.1.0-alpha.0

### Minor Changes

- 18f74ea: First public alpha: JSON Schema to React form pipeline.
  
  Schema evaluation, IR compiler, headless runtime, React bindings, default widgets, and prop getters.
