[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/angular](../README.md) / AngularForm

# Interface: AngularForm

## Properties

### data

> **data**: `Signal`\<`unknown`\>

***

### document

> **document**: `Signal`\<[`UIDocument`](../../core/interfaces/UIDocument.md)\<`1`\>\>

***

### runtime

> **runtime**: [`FormRuntime`](../../core/interfaces/FormRuntime.md)

***

### submission

> **submission**: `Signal`\<[`SubmissionState`](../../core/interfaces/SubmissionState.md)\>

***

### visibleErrors

> **visibleErrors**: `Signal`\<[`VisibleError`](../../core/interfaces/VisibleError.md)[]\>

## Methods

### dispatch()

> **dispatch**(`command`): `void`

#### Parameters

##### command

[`Command`](../../core/type-aliases/Command.md)

#### Returns

`void`

***

### getNodeState()

> **getNodeState**(`nodeId`): [`NodeState`](../../core/interfaces/NodeState.md) \| `undefined`

#### Parameters

##### nodeId

[`NodeId`](../../core/type-aliases/NodeId.md)

#### Returns

[`NodeState`](../../core/interfaces/NodeState.md) \| `undefined`
