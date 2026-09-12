# @texaryn/schema-json

## 0.6.0

### Minor Changes

- 8f2a2cd: Makes a disagreement between `default` declarations expressible when a
  conditional branch carries one, closing #142.
  
  `NodeProjection.defaultConflict` names the schema positions whose applicable
  declarations disagree, present exactly where `AnnotationSet.default` was omitted
  for that reason. Every conflict appears there, conditional or not, so a consumer
  deciding what to do about a location reads one place.
  `SchemaProjection.diagnostics` keeps `ambiguous-default` for the subset that
  holds whatever the instance is, because a contradiction in the schema is worth
  telling whoever wrote it, while one that comes and goes as a discriminator is
  typed would make that channel flap.
  
  Before this, a declaration carried by `oneOf`, `anyOf`, `if`/`then`/`else` or
  `dependentSchemas` collapsed to whichever value the library's merge kept, so
  the same schema and the same data produced different form data depending on
  which adapter an application depended on. Measured through `createFormRuntime`
  with `initialization: 'schema-defaults'`: a selected `oneOf` branch against the
  base gave `'from-b'` against `'own'`, two matching `anyOf` branches gave
  `'from-second'` against `'from-first'`, and a provisionally selected branch
  against the base gave `'from-branch'` against `'base'`. All six now leave the
  location absent and report the positions that disagreed.
  
  Applicability for the node channel is exposure rather than validity: a
  provisionally selected branch competes, though JSON Schema says it does not
  apply, because ADR-003 fills from one and a disagreement has to be visible where
  the fill would happen.
  
  `@texaryn/core`'s initialization view reads conflicts from the node rather than
  from the diagnostics channel. Nothing published changes shape; the diagnostics a
  consumer already read are unchanged.

### Patch Changes

- Updated dependencies [8f2a2cd]
- Updated dependencies [20d977f]
  - @texaryn/core@0.11.0

## 0.5.1

### Patch Changes

- Updated dependencies [aa69a86]
- Updated dependencies [0afa5a2]
  - @texaryn/core@0.10.0

## 0.5.0

### Minor Changes

- a53724c: Report two disagreeing applicable defaults rather than merging them
  
  `AnnotationSet.default` is one value, so an adapter that merges before core sees
  anything reported whichever declaration its merge kept. For
  
  ```ts
  {
    type: 'object',
    allOf: [
      { properties: { x: { type: 'string', default: 'a' } } },
      { properties: { x: { type: 'string', default: 'b' } } },
    ],
  }
  ```
  
  `@texaryn/schema-json` reported `'b'` and `@texaryn/schema-json-hyperjump`
  reported `'a'`. Neither is wrong, which is why neither can be the answer: in
  JSON Schema two `allOf` branches are conjunctive and neither is nearer.
  
  `/x` now projects with no `default` at all, and the projection carries an
  `ambiguous-default` diagnostic naming the two schema positions that disagreed.
  That is the rule `ambiguous-projection-shape` already applies to a shape two
  keyword families disagree about, one level down.
  
  Scope is declarations that apply to every instance: a location's own, and those
  reached through `allOf` and `$ref`. A declaration carried by `oneOf`, `anyOf`,
  `if`/`then`/`else` or `dependentSchemas` competes with the base only while its
  branch applies, so whether it disagrees is a state of the data rather than a
  fact about the schema, and `SchemaProjection.diagnostics` carries the latter.
  Those still collapse, tracked as #142.
  
  **Behaviour change.** A caller reading `annotations.default` for such a location
  used to get a value and now gets `undefined`. That value was one library's
  traversal order, so relying on it was relying on the adapter rather than on the
  schema, but it is a change and this is why the bump is `minor`, which is the
  break bump under 0.x.
  
  `ProjectionDiagnostic` gains an optional `sources`, the schema positions a
  diagnostic is about, as JSON Pointers into the schema document with the root as
  the empty string. A position reached through `$ref` is named by what it resolves
  to. Both adapters report in that form, so a diagnostic means the same thing
  whichever produced it.
  
  `@texaryn/schema-json-hyperjump` implements the same rule and gains the same
  break. It is unpublished, so it carries no version here. It also returns a
  `diagnostics` array for the first time, carrying `ambiguous-default` and only
  that code: it detects neither shape code, so an empty array from it is not a
  claim that no schema in the projection was ambiguous.
  
  `NodeProjection.itemAnnotations.default` is unchanged and still collapses. It
  describes an array's item schema rather than being an instance location, so
  there is no pointer an omission there could be reported at, and the element
  locations the data provides each report their own conflict.

### Patch Changes

- Updated dependencies [a53724c]
  - @texaryn/core@0.9.0

## 0.4.0

### Minor Changes

- 7bd64e5: Project conditional fields declared inside nested applicators
  
  A property that only a nested branch declares was never projected, so the form
  could not collect a value its own validation demanded. Given the conditional
  idiom Backstage's documentation tells template authors to write,
  `dependencies` containing `allOf` containing `if`/`then`, the validator
  reported `/lastName` as required and the projection had no `/lastName` at all:
  a step that cannot be completed or corrected.
  
  Candidate discovery now recurses through the applicators that act on the same
  instance location (`if`, `then`, `else`, `allOf`, `anyOf`, `oneOf`,
  `dependentSchemas`, and `$ref` targets) rather than reading one level of each.
  It does not follow `not`, whose subschema describes what an instance must not
  be, nor the values of `properties` or `items`, which describe other locations.
  
  The defect was never specific to `dependencies`: a top-level `allOf` containing
  `if`/`then` failed the same way.
- 7f22daf: Provisionally selects the `oneOf` branch the current data uniquely identifies,
  so a form can show the field that would make that branch apply.
  
  `oneOf` selects on full validity, so a branch identified by an explicit
  discriminator stays unselected while one of its own required properties is
  absent. The branch's fields were therefore inactive, which hid the very field
  needed to complete it: the exit from the state existed and the form could not
  reach it. Those fields now report `provisional`, and the branch's requirements
  report `provisionalRequired`, both added to the port in `@texaryn/core` 0.8.0.
  
  The rule is narrow on purpose. Only an explicit `const` or `enum` on a property
  discriminates, and only where every branch constrains that property; both
  keywords together are conjunctive; the discriminator has to be present in the
  data rather than declared as a `default`; every present discriminator has to
  agree; and zero or several surviving branches select nothing. `type` and `anyOf`
  are excluded. Nothing else about a branch participates, so a branch stays
  identified when some other constraint of its own fails.
  
  A selected branch also supplies its children's shape and annotations, ahead of
  the previous first-declaration fallback, so an exposed field carries its own
  branch's widget, title and `default` rather than another branch's.
  
  One correction comes with it: `ChildProjection.required` is now gated on the
  containing node applying. A branch that does not apply demands nothing, and
  reporting its `required` array attributed to the validator something it was not
  asking for. Previously such a child was reported required while `validate`
  reported no errors.
- f548009: Resolve the published JSON Schema metaschemas, so a schema can assert that it is itself a valid schema.
  
  A schema may reference its dialect's metaschema by canonical URI, which is how the specification's own test suite checks schema validity. `json-schema-library` carries the draft definitions but not the metaschema documents, and an unresolved reference fails closed, so previously a perfectly valid schema was reported invalid with `Could not resolve $ref`. Draft 7, 2019-09 and 2020-12 all work now, including the vocabulary documents the later two reference.
  
  The documents are vendored, so nothing is fetched over the network, and they are loaded on demand: a form that never asks the question does not carry them. Loading is keyed on `$ref`, `$dynamicRef` and `$recursiveRef`, never on `$schema`, because every schema declares one of those and the validator maps it to a draft without retrieving anything. The dialect comes from the URI that was referenced rather than the one detected, so a Draft 7 schema referencing the 2020-12 metaschema gets the right closure.
  
  One inherited consequence is worth knowing: metaschema validation follows the dialect's `format` rule, so a malformed `pattern` or `$id` is rejected under Draft 7, which asserts `format`, and not under 2019-09 or 2020-12, which treat it as an annotation. Strict schema linting would be a separate capability rather than a change to validation semantics.
  
  Against the official test suite this closes all six standard-metaschema failures, taking mandatory results to 917/929 for Draft 7, 1244/1261 for 2019-09 and 1278/1301 for 2020-12, with no other result moving in either adapter.
- 748b250: Derive a form shape for schemas that declare structure without `type`
  
  A schema is not obliged to declare `type`, and one that declares `properties`
  without it is both valid and widespread: not one parameter step in a Backstage
  Software Template declares `type: object`. Every such schema used to project no
  node at all, which threw at the root and, one level down, dropped the field
  from the form with no error at all.
  
  The projection now derives a shape from type-specific structural keywords when
  exactly one JSON type's keywords are present, and reports the pointer as
  ambiguous when more than one type's are. Nothing scalar is inferred, because
  `minimum` cannot distinguish `number` from `integer` and a wrong guess selects
  the wrong widget.
  
  This is a projection decision and not a type assertion. No `type` is written
  into the schema and the schema is never mutated, so
  `{ properties: { name: … } }` continues to accept a string, a number and null,
  exactly as JSON Schema says it should, while the form renders as an object.
  
  `SchemaProjection` gains an optional `diagnostics` array, with the
  `ProjectionDiagnostic` and `ProjectionDiagnosticCode` types, so a pointer that
  could not be given a shape is reported rather than silently absent. Two codes:
  `ambiguous-projection-shape` where keywords from more than one type conflict,
  and `unresolved-projection-shape` where there is nothing to go on at all. An
  `enum` without a `type` is the common case of the second, and deliberately not
  read as a string, because JSON Schema permits members of different types.
  
  Diagnostics describe schemas rather than data. One case is not reported: a
  `oneOf` or `anyOf` whose branches the current value does not match, where some
  branch would have rendered for a value that did. Whether the value is
  acceptable is validation's subject. A branch the value does match and that
  still supplies no shape is reported, as is a composition with no renderable
  branch at all, because those are limitations rather than data states.
  
  The rule in full: an explicit `type` is used, an unambiguous structural shape
  is derived, and everything else is reported. Nothing is guessed and nothing
  disappears without a word.

### Patch Changes

- Updated dependencies [89c44e5]
- Updated dependencies [43e4370]
- Updated dependencies [b2bb9d6]
- Updated dependencies [55ce8d6]
- Updated dependencies [a835e87]
- Updated dependencies [9b262d3]
- Updated dependencies [748b250]
  - @texaryn/core@0.8.0

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
