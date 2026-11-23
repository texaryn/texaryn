[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/schema-json](../README.md) / ProjectionValidationDivergenceError

# Class: ProjectionValidationDivergenceError

## Extends

- `Error`

## Constructors

### Constructor

> **new ProjectionValidationDivergenceError**(`reference`, `sourcePosition`, `validationPosition`, `projectionPosition`): `ProjectionValidationDivergenceError`

#### Parameters

##### reference

`string`

##### sourcePosition

`string`

##### validationPosition

`string`

##### projectionPosition

`string`

#### Returns

`ProjectionValidationDivergenceError`

#### Overrides

`Error.constructor`

## Properties

### cause?

> `optional` **cause?**: `unknown`

#### Inherited from

`Error.cause`

***

### message

> **message**: `string`

#### Inherited from

`Error.message`

***

### name

> **name**: `string`

#### Inherited from

`Error.name`

***

### projectionPosition

> `readonly` **projectionPosition**: `string`

***

### reference

> `readonly` **reference**: `string`

***

### sourcePosition

> `readonly` **sourcePosition**: `string`

***

### stack?

> `optional` **stack?**: `string`

#### Inherited from

`Error.stack`

***

### validationPosition

> `readonly` **validationPosition**: `string`
