[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/react](../README.md) / useObjectGroup

# Function: useObjectGroup()

> **useObjectGroup**(`node`): [`ObjectGroup`](../interfaces/ObjectGroup.md)

The grouping decision, shared by every React widget set so the three cannot
drift apart. The node comes from the document rather than the prop, because
a memo bailout on an unchanged id would otherwise freeze the title.

## Parameters

### node

[`UINode`](../../core/type-aliases/UINode.md)

## Returns

[`ObjectGroup`](../interfaces/ObjectGroup.md)
