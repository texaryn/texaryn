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
runtime's data stays `{}`. `'schema-defaults'` fills every reachable
location the schema declares a default for and the data leaves absent, at
construction and on `Reset`.

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
