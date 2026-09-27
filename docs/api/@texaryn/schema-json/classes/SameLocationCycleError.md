[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/schema-json](../README.md) / SameLocationCycleError

# Class: SameLocationCycleError

Thrown when a schema position applies itself to the instance location it is evaluating.

## Extends

- `Error`

## Constructors

### Constructor

> **new SameLocationCycleError**(`positions`, `cycles`): `SameLocationCycleError`

#### Parameters

##### positions

readonly readonly `string`[][]

##### cycles

readonly `string`[]

#### Returns

`SameLocationCycleError`

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

### positions

> `readonly` **positions**: readonly readonly `string`[][]

***

### stack?

> `optional` **stack?**: `string`

#### Inherited from

`Error.stack`
