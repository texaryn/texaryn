# @texaryn/schema-json

## 0.3.0

### Minor Changes

- 8a5ba0b: Stop asserting `format` in 2019-09, where the specification makes it an annotation.
  
  From 2019-09 the default vocabulary is format-annotation, so `format` describes a value rather than constraining it unless format-assertion is explicitly declared. 2020-12 was already handled; 2019-09 was not, so `{ "type": "string", "format": "email" }` rejected `"2962"` on a dialect where it should be valid. Draft 7 is unchanged and still asserts: that is the conventional behaviour there, and the specification asks only that it can be turned off.
  
  This changes validation results, which is why it is a minor rather than a patch. Anyone relying on 2019-09 rejecting a malformed `format` value loses that, and the way to keep it is to declare the format-assertion vocabulary in the schema.
  
  The old behaviour also rejected valid data, which is the more concrete argument for the change. Against the official JSON Schema Test Suite, six `optional/format/email` cases now pass that previously failed, covering quoted local parts, escaped characters and an IPv6 address literal: all legitimate addresses the underlying checker refused. The suite's 2019-09 optional pass count moves 782 to 563 in the other direction, because those cases deliberately measure an implementation that has format assertion switched on, which is no longer the default here. No mandatory result changes in any dialect.
- 04270e8: Give every array action control an accessible name that says which row it acts on.
  
  Five buttons all announced as "Remove" leave a screen reader user guessing. Each now carries the current 1-based position and whatever schema titles exist, so "Remove Contact 2 from Contacts", degrading to "Remove item 2" when nothing is titled. Reorder controls read "Move up Contact 2 in Contacts", and the per-array control reads "Add item to Contacts". The visible words stay "Remove", "Up" and "Add", with the longer string in `aria-label`, which contains the visible text so speech input still works.
  
  The row's own value is deliberately not used: it is mutable, often blank, frequently duplicated, and sometimes sensitive. The position is recomputed on every render rather than captured when a row is created, because a row survives a move while its position does not.
  
  The add control is named from the item template rather than from the first row, so an empty array still says "Add Tag" where naming it matters most. That needed the template's annotations, which the projection did not carry: `NodeProjection.itemAnnotations` is new and optional, so an adapter that cannot supply it stays valid, and `ArrayMeta.itemTitle` carries the result to renderers.
  
  React exposes the decision as `useArrayActions` so its three widget sets cannot drift, and the name builders are exported for custom widgets. Reorder-control parity is unchanged: the three React sets still expose no reorder button.

### Patch Changes

- Updated dependencies [04270e8]
  - @texaryn/core@0.7.0

## 0.2.5

### Patch Changes

- Updated dependencies [e7c00ce]
  - @texaryn/core@0.6.0

## 0.2.4

### Patch Changes

- Updated dependencies [8b20b6e]
  - @texaryn/core@0.5.0

## 0.2.3

### Patch Changes

- Updated dependencies [ffae9f1]
  - @texaryn/core@0.4.0

## 0.2.2

### Patch Changes

- Updated dependencies [cd13f98]
- Updated dependencies [3172a01]
  - @texaryn/core@0.3.0

## 0.2.1

### Patch Changes

- 01f6065: Depend on `@texaryn/core` through a caret range rather than an exact version. The previous exact pin made each release usable only against the single `@texaryn/core` build it shipped beside, which forced all three packages to move together. They now version independently, so a version describes that package's own public contract.

## 0.2.0

### Patch Changes

- Updated dependencies [f223cf9]
  - @texaryn/core@0.2.0

## 0.1.2

### Patch Changes

- 25cb16e: Add focused npm search keywords and GitHub Sponsors funding metadata to the public packages.
- Updated dependencies [25cb16e]
  - @texaryn/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [9bcc0b2]
  - @texaryn/core@0.1.1

## 0.1.0

### Minor Changes

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
