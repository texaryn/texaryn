[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / RuntimeState

# Interface: RuntimeState

## Properties

### boundaryGeneration?

> `optional` **boundaryGeneration?**: `number`

Invalidates boundary tokens when replacing containers can change pointer
ownership.

***

### data

> **data**: `unknown`

***

### expandedBoundaryTokens?

> `optional` **expandedBoundaryTokens?**: `ReadonlySet`\<`string`\>

View state for boundary targets that a user explicitly expanded.

***

### identities

> **identities**: [`IdentityMap`](IdentityMap.md)

***

### initialData

> **initialData**: `unknown`

***

### nodes

> **nodes**: `Map`\<[`NodeId`](../type-aliases/NodeId.md), [`NodeRuntimeState`](NodeRuntimeState.md)\>

***

### submission

> **submission**: [`SubmissionState`](SubmissionState.md)
