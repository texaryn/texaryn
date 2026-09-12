[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / FormRuntimeOptions

# Interface: FormRuntimeOptions

## Properties

### hints?

> `optional` **hints?**: [`UIHints`](UIHints.md)

***

### initialData?

> `optional` **initialData?**: `unknown`

***

### initialization?

> `optional` **initialization?**: [`InitializationPolicy`](../type-aliases/InitializationPolicy.md)

ADR-003. `'none'`, the default, materialises nothing: given `{}` the
runtime's data stays `{}`.

`'schema-defaults'` fills every reachable location the schema declares a
default for and the data leaves absent. A location is filled when it
becomes reachable, so this runs at construction, on `Reset`, and after any
edit that can change what is reachable: activating a `oneOf` branch by
setting its discriminator fills that branch's own defaults. It never
overwrites, so `false`, `0`, `''` and `null` are values and are left alone.

What the run wrote is the baseline at construction and on `Reset`, and is
not between them: a location seeded by an edit differs from
`state.initialData`, which is what `modified` reports.

Omitting `initialData` is not the same as passing `{}`. The first states
nothing about the root, so a root-level `default` applies to it; the second
is a root the caller supplied, and nothing is written over it.

***

### onSubmit?

> `optional` **onSubmit?**: (`data`) => [`MaybePromise`](../type-aliases/MaybePromise.md)\<`void`\>

#### Parameters

##### data

`unknown`

#### Returns

[`MaybePromise`](../type-aliases/MaybePromise.md)\<`void`\>

***

### validationDebounceMs?

> `optional` **validationDebounceMs?**: `number`
