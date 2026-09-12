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
run that exhausts its budget reports here rather than throwing into the
host's render. What that discards depends on the moment: a `Reset`
establishes a baseline, so it is refused whole and nothing lands, while an
ordinary edit establishes none, so the edit lands and only the seeding is
dropped. `createFormRuntime` throws instead, because a caller can decline a
runtime it never received.

A new report is published on every data-mutating dispatch under the policy,
including one where the pass wrote nothing, because each dispatch is a run
and what a run finds changes as the user types. Anything subscribed here
therefore updates per edit.

It is not the projection's diagnostics channel, which describes a schema
rather than one run over data.

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
