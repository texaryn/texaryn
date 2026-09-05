[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / UseFormReturn

# Interface: UseFormReturn

## Properties

### data

> **data**: `Ref`\<`unknown`\>

***

### document

> **document**: `Ref`\<[`UIDocument`](../../core/interfaces/UIDocument.md)\>

***

### runtime

> **runtime**: [`FormRuntime`](../../core/interfaces/FormRuntime.md)

***

### submission

> **submission**: `Ref`\<[`SubmissionState`](../../core/interfaces/SubmissionState.md)\>

***

### visibleErrors

> **visibleErrors**: `Ref`\<[`VisibleError`](../../core/interfaces/VisibleError.md)[]\>

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
