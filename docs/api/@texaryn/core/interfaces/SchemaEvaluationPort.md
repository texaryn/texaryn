[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / SchemaEvaluationPort

# Interface: SchemaEvaluationPort

## Methods

### project()

> **project**(`data`): [`SchemaProjection`](SchemaProjection.md)

#### Parameters

##### data

`unknown`

#### Returns

[`SchemaProjection`](SchemaProjection.md)

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
