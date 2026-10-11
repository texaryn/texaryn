[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/svelte](../README.md) / SvelteForm

# Interface: SvelteForm

## Extends

- [`SvelteFormBinding`](SvelteFormBinding.md)

## Properties

### data

> **data**: `Readable`\<`unknown`\>

#### Inherited from

[`SvelteFormBinding`](SvelteFormBinding.md).[`data`](SvelteFormBinding.md#data)

***

### document

> **document**: `Readable`\<[`UIDocument`](../../core/interfaces/UIDocument.md)\>

#### Inherited from

[`SvelteFormBinding`](SvelteFormBinding.md).[`document`](SvelteFormBinding.md#document)

***

### runtime

> **runtime**: [`FormRuntime`](../../core/interfaces/FormRuntime.md)

#### Inherited from

[`SvelteFormBinding`](SvelteFormBinding.md).[`runtime`](SvelteFormBinding.md#runtime)

***

### submission

> **submission**: `Readable`\<[`SubmissionState`](../../core/interfaces/SubmissionState.md)\>

#### Inherited from

[`SvelteFormBinding`](SvelteFormBinding.md).[`submission`](SvelteFormBinding.md#submission)

***

### visibleErrors

> **visibleErrors**: `Readable`\<[`VisibleError`](../../core/interfaces/VisibleError.md)[]\>

#### Inherited from

[`SvelteFormBinding`](SvelteFormBinding.md).[`visibleErrors`](SvelteFormBinding.md#visibleerrors)

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

[`Command`](../../core/type-aliases/Command.md)

#### Returns

`void`

#### Inherited from

[`SvelteFormBinding`](SvelteFormBinding.md).[`dispatch`](SvelteFormBinding.md#dispatch)

***

### getNodeState()

> **getNodeState**(`nodeId`): [`NodeState`](../../core/interfaces/NodeState.md) \| `undefined`

#### Parameters

##### nodeId

[`NodeId`](../../core/type-aliases/NodeId.md)

#### Returns

[`NodeState`](../../core/interfaces/NodeState.md) \| `undefined`

#### Inherited from

[`SvelteFormBinding`](SvelteFormBinding.md).[`getNodeState`](SvelteFormBinding.md#getnodestate)
