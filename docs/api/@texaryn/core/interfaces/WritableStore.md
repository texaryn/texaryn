[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / WritableStore

# Interface: WritableStore\<T\>

## Extends

- [`Store`](Store.md)\<`T`\>

## Type Parameters

### T

`T`

## Methods

### getSnapshot()

> **getSnapshot**(): `T`

#### Returns

`T`

#### Inherited from

[`Store`](Store.md).[`getSnapshot`](Store.md#getsnapshot)

***

### set()

> **set**(`value`): `void`

#### Parameters

##### value

`T`

#### Returns

`void`

***

### subscribe()

> **subscribe**(`listener`): () => `void`

#### Parameters

##### listener

() => `void`

#### Returns

() => `void`

#### Inherited from

[`Store`](Store.md).[`subscribe`](Store.md#subscribe)
