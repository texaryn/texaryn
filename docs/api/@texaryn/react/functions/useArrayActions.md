[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/react](../README.md) / useArrayActions

# Function: useArrayActions()

> **useArrayActions**(`node`): [`ArrayActions`](../interfaces/ArrayActions.md)

Shared by the three React widget sets so their action names cannot drift.
The array title is read from the document rather than the node prop: these
widgets are memoized on node id, so a conditional annotation added by a
recompile would otherwise never reach the name.

## Parameters

### node

[`UINode`](../../core/type-aliases/UINode.md)

## Returns

[`ArrayActions`](../interfaces/ArrayActions.md)
