[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/svelte](../README.md) / SvelteFormBinding

# Interface: SvelteFormBinding

## Extended by

- [`SvelteForm`](SvelteForm.md)

## Properties

### data

> **data**: `Readable`\<`unknown`\>

***

### document

> **document**: `Readable`\<[`UIDocument`](../../core/interfaces/UIDocument.md)\>

***

### runtime

> **runtime**: [`FormRuntime`](../../core/interfaces/FormRuntime.md)

***

### submission

> **submission**: `Readable`\<[`SubmissionState`](../../core/interfaces/SubmissionState.md)\>

***

### visibleErrors

> **visibleErrors**: `Readable`\<[`VisibleError`](../../core/interfaces/VisibleError.md)[]\>

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
