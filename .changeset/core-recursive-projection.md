---
'@texaryn/core': minor
---

The port describes a recursive schema's projection, closing #119.
`NodeProjection` gains `boundaries` (`ProjectionBoundary`: `recursion` on a
past-the-data object whose schemas a descendant would repeat, `budget` on an
object whose members the budget withheld), `recursiveExpansion` (the node exists
only because the projection expanded recursion past the data) and
`defaultSources` (the schema positions behind `annotations.default`, on a node
whose schemas lie on a cycle). The compiler copies an object's boundaries to
`ContainerNode.boundaries`, which a binding may ignore.

`schema-defaults` initialization never writes at a node with
`recursiveExpansion`, and reports a default declared there as the refusal
`recursive-expansion`. A default that opens a level (an object or a non-empty
array) is refused as `recursive-default` when an ancestor that holds data, or
that the same run wrote, has one of its sources, so a default that recreates
itself is written once and then refused, and stays at that depth across edits. A
default of `[]`, `null` or a scalar is written. `objectChildKey(node)` returns
the key every binding uses for an object's children: the last segment of the
node's data pointer, or its node id when it has none.
