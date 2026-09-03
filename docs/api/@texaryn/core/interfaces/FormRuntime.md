[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / FormRuntime

# Interface: FormRuntime

## Properties

### data

> `readonly` **data**: [`Store`](Store.md)\<`unknown`\>

***

### document

> `readonly` **document**: [`Store`](Store.md)\<[`UIDocument`](UIDocument.md)\>

***

### submission

> `readonly` **submission**: [`Store`](Store.md)\<[`SubmissionState`](SubmissionState.md)\>

***

### visibleErrors

> `readonly` **visibleErrors**: [`Store`](Store.md)\<[`VisibleError`](VisibleError.md)[]\>

## Methods

### destroy()

> **destroy**(): `void`

#### Returns

`void`

***

### dispatch()

> **dispatch**(`command`): `void`

#### Parameters

##### command

[`Command`](../type-aliases/Command.md)

#### Returns

`void`

***

### getNodeState()

> **getNodeState**(`nodeId`): [`NodeState`](NodeState.md) \| `undefined`

#### Parameters

##### nodeId

[`NodeId`](../type-aliases/NodeId.md)

#### Returns

[`NodeState`](NodeState.md) \| `undefined`
