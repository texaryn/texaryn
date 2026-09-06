[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/web-components](../README.md) / arrayControl

# Function: arrayControl()

> **arrayControl**(`initial`, `ctx`): [`DomWidget`](../interfaces/DomWidget.md)

Rows are keyed by `StableItemId`, which survives insert, remove and move,
and each row's binding is re-pointed at whatever positional node now sits
at its index. Buttons resolve their index at click time for the same
reason: an index captured at render time is stale after any mutation.

## Parameters

### initial

[`UINode`](../../core/type-aliases/UINode.md)

### ctx

[`RenderContext`](../interfaces/RenderContext.md)

## Returns

[`DomWidget`](../interfaces/DomWidget.md)
