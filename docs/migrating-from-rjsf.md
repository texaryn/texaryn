# Migrating from react-jsonschema-form (RJSF)

This guide maps RJSF concepts to their Texaryn equivalents and lists the steps for porting an existing RJSF form.

## Concept map

| RJSF | Texaryn |
| --- | --- |
| `schema` prop | `createJsonSchemaAdapter(schema)` |
| `uiSchema` | UI hints keyed by JSON Pointer |
| `formData` / `onChange` | `initialData` option, `data` store |
| widgets, templates, fields | renderer registry, `WidgetComponent`, `NodeRenderer` |
| array rendering | `useFieldArray` with stable item identity |
| `validate`, `customValidate`, `liveValidate` | schema adapter validation, `validationTrigger` hints |
| `onSubmit` | `onSubmit` option plus the submission lifecycle |
| `showErrorList` / `ErrorList` | `visibleErrors` store, `ErrorSummary` component |
| `transformErrors` | not available in 0.1.0 (listed as a gap) |

## Key differences

**Schema evaluation is separate from the runtime.** In RJSF, `Form` processes the schema, manages state, and renders. In Texaryn, a schema adapter produces a `SchemaEvaluationPort` that the runtime consumes. The runtime owns state. The renderer maps UI nodes to components. These three concerns are independent.

**Framework-neutral core.** `@texaryn/core` has no dependency on React. The React bindings (`@texaryn/react`) are one consumer of the core contracts. RJSF is React only.

**No centralized mutable state.** RJSF keeps form state in a single mutable object. Texaryn uses reactive stores that renderers subscribe to. Edits produce new snapshots rather than mutating state in place.

**Stable array identity.** RJSF uses `Math.random()` for array item keys, which destroys component identity on reorder. Texaryn assigns stable identity per item using content hashing or explicit `itemKey` hints.

**Validation is per-field, not whole-form.** RJSF validates the entire form on every change (with `liveValidate`) or only on submit. Texaryn validates individual fields based on `validationTrigger` hints (`'blur'`, `'change'`, or `'submit'`) with configurable debounce.

**Submission is a state machine.** RJSF calls `onSubmit` synchronously after validation. Texaryn models submission as a lifecycle with four states (`idle`, `validating`, `submitting`, `submitted`), with snapshot semantics and cancellation.

## Migration checklist

1. **Inventory your `uiSchema`.** Map each `ui:` key to a Texaryn hint at the corresponding JSON Pointer. For example, `uiSchema: { email: { 'ui:placeholder': '...' } }` becomes `hints: { '/email': { placeholder: '...' } }`.

2. **Register custom widgets.** If you have custom RJSF widgets or templates, implement them as `WidgetComponent` entries in a Texaryn renderer registry. `NodeRenderer` dispatches to the registry by semantic type and widget hint.

3. **Replace `formData` plumbing.** Remove the `formData` prop and `onChange` handler. Pass `initialData` to `useForm` (or `createFormRuntime`). Read live data from `form.data` (React) or `runtime.data` (core).

4. **Port validation.** Remove `validate`, `customValidate`, and `liveValidate` props. Set `validationTrigger` per field in hints. The schema adapter handles standard JSON Schema validation. Custom validation beyond the schema is not yet available in 0.1.0.

5. **Port submission.** Replace the `onSubmit` prop with the `onSubmit` option in `useForm`. Dispatch `{ type: 'Submit' }` from a button. Read `form.submission.status` and `form.submission.error` for lifecycle feedback.

6. **Review array identity.** If your RJSF form relied on array item keys, test that reordering and removal work correctly with Texaryn's stable identity. Use the `itemKey` hint to control identity from a data field when needed.

7. **Review accessibility.** Texaryn prop getters (`getInputProps`, `getLabelProps`, `getErrorProps`, `getDescriptionProps`) set `aria-invalid` and `aria-describedby` automatically. Remove manual ARIA attributes from custom widgets and let the prop getters handle them.

## Gaps in 0.1.0

- `transformErrors`: no equivalent yet. File an issue if you need error message customization.
- `extraErrors`: server-side errors injected after validation are not supported.
- `formContext`: use React context or component props directly.
- `ObjectFieldTemplate` / `ArrayFieldTemplate`: use a custom renderer registry with `WidgetComponent` entries.

See [Getting started](getting-started.md) for a complete working example.
