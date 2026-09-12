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

### initialization

> `readonly` **initialization**: [`Store`](Store.md)\<[`InitializationReport`](../type-aliases/InitializationReport.md) \| `undefined`\>

The last initialization run, or `undefined` where no policy is configured.

`dispatch` returns void and is typically called from an event handler, so a
`Reset` that exhausts the budget reports here rather than throwing into the
host's render. It is not the projection's diagnostics channel, which
describes a schema rather than one run over data.

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
