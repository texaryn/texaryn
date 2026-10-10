[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / ProjectionBoundaryTarget

# Interface: ProjectionBoundaryTarget

The next instance location withheld by a recursion or projection budget
boundary.

## Properties

### pointer

> **pointer**: [`JsonPointer`](../type-aliases/JsonPointer.md)

Instance location that the projection withheld.

***

### reason

> **reason**: [`ProjectionBoundary`](../type-aliases/ProjectionBoundary.md)

Whether recursion or the per projection budget withheld this location.

***

### token

> **token**: `string`

Generation scoped opaque token to pass to
`ProjectionOptions.expandedBoundaryTokens` when the view should reveal this
location.
