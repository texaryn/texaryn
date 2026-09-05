[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / useField

# Function: useField()

> **useField**(`nodeId`): [`UseFieldReturn`](../interfaces/UseFieldReturn.md)

The node id is accepted as a ref or getter, not a value, and that is load
bearing rather than a convenience.

Node ids are assigned by traversal order, so an array item's id follows its
position. Item identity is carried separately, by `StableItemId`, and a
widget keyed on that correctly survives a move with its component instance
intact while the id underneath it changes. React re-reads the id on every
render, so it follows along for free. A Vue composable that captured the id
in `setup` would keep subscribing to the old position and, worse, keep
dispatching to it: typing into a moved row would write to the row that took
its place.

## Parameters

### nodeId

`MaybeRefOrGetter`\<[`NodeId`](../../core/type-aliases/NodeId.md)\>

## Returns

[`UseFieldReturn`](../interfaces/UseFieldReturn.md)
