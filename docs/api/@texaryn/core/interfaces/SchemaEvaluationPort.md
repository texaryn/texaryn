[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / SchemaEvaluationPort

# Interface: SchemaEvaluationPort

## Extended by

- [`ZodSchemaAdapter`](../../schema-zod/interfaces/ZodSchemaAdapter.md)

## Methods

### project()

> **project**(`data`, `options?`): [`SchemaProjection`](SchemaProjection.md)

#### Parameters

##### data

`unknown`

##### options?

[`ProjectionOptions`](ProjectionOptions.md)

#### Returns

[`SchemaProjection`](SchemaProjection.md)

***

### projectSubmission()?

> `optional` **projectSubmission**(`data`): `unknown`

Returns an independent snapshot with data from inactive schema declarations removed.

#### Parameters

##### data

`unknown`

#### Returns

`unknown`

***

### validate()

> **validate**(`data`): [`MaybePromise`](../type-aliases/MaybePromise.md)\<[`ValidationResult`](ValidationResult.md)\>

#### Parameters

##### data

`unknown`

#### Returns

[`MaybePromise`](../type-aliases/MaybePromise.md)\<[`ValidationResult`](ValidationResult.md)\>

***

### validateAt()?

> `optional` **validateAt**(`data`, `pointer`): [`MaybePromise`](../type-aliases/MaybePromise.md)\<[`ValidationResult`](ValidationResult.md)\>

#### Parameters

##### data

`unknown`

##### pointer

[`JsonPointer`](../type-aliases/JsonPointer.md)

#### Returns

[`MaybePromise`](../type-aliases/MaybePromise.md)\<[`ValidationResult`](ValidationResult.md)\>
