[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/schema-zod](../README.md) / ZodSchemaAdapter

# Interface: ZodSchemaAdapter

## Extends

- [`SchemaEvaluationPort`](../../core/interfaces/SchemaEvaluationPort.md)

## Properties

### projectSubmission?

> `optional` **projectSubmission?**: `undefined`

Returns an independent snapshot with data from inactive schema declarations removed.

#### Overrides

[`SchemaEvaluationPort`](../../core/interfaces/SchemaEvaluationPort.md).[`projectSubmission`](../../core/interfaces/SchemaEvaluationPort.md#projectsubmission)

## Methods

### project()

> **project**(`data`, `options?`): [`SchemaProjection`](../../core/interfaces/SchemaProjection.md)

#### Parameters

##### data

`unknown`

##### options?

[`ProjectionOptions`](../../core/interfaces/ProjectionOptions.md)

#### Returns

[`SchemaProjection`](../../core/interfaces/SchemaProjection.md)

#### Inherited from

[`SchemaEvaluationPort`](../../core/interfaces/SchemaEvaluationPort.md).[`project`](../../core/interfaces/SchemaEvaluationPort.md#project)

***

### validate()

> **validate**(`data`): [`MaybePromise`](../../core/type-aliases/MaybePromise.md)\<[`ValidationResult`](../../core/interfaces/ValidationResult.md)\>

#### Parameters

##### data

`unknown`

#### Returns

[`MaybePromise`](../../core/type-aliases/MaybePromise.md)\<[`ValidationResult`](../../core/interfaces/ValidationResult.md)\>

#### Inherited from

[`SchemaEvaluationPort`](../../core/interfaces/SchemaEvaluationPort.md).[`validate`](../../core/interfaces/SchemaEvaluationPort.md#validate)

***

### validateAt()

> **validateAt**(`data`, `pointer`): `Promise`\<[`ValidationResult`](../../core/interfaces/ValidationResult.md)\>

#### Parameters

##### data

`unknown`

##### pointer

[`JsonPointer`](../../core/type-aliases/JsonPointer.md)

#### Returns

`Promise`\<[`ValidationResult`](../../core/interfaces/ValidationResult.md)\>

#### Overrides

[`SchemaEvaluationPort`](../../core/interfaces/SchemaEvaluationPort.md).[`validateAt`](../../core/interfaces/SchemaEvaluationPort.md#validateat)
