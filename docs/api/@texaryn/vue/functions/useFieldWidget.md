[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/vue](../README.md) / useFieldWidget

# Function: useFieldWidget()

> **useFieldWidget**(`nodeSource`): [`FieldWidget`](../interfaces/FieldWidget.md)

Everything a native widget needs, derived from a node that is allowed to
change under it. The node arrives as a getter for the same reason the node
id does in useField: an array move hands a widget a different node while
keeping its component instance.

## Parameters

### nodeSource

`MaybeRefOrGetter`\<[`FieldNode`](../../core/interfaces/FieldNode.md)\>

## Returns

[`FieldWidget`](../interfaces/FieldWidget.md)
