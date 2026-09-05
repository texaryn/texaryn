[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / FieldArrayItem

# Interface: FieldArrayItem

## Properties

### id

> **id**: [`StableItemId`](../../core/type-aliases/StableItemId.md)

Survives inserts, removes and moves. The key to render this row with.

***

### nodeId

> **nodeId**: [`NodeId`](../../core/type-aliases/NodeId.md) \| `undefined`

Positional, so it changes under a row that moves. Undefined when the
projection emitted no per-item child pointer.
