---
'@texaryn/core': minor
---

The port describes a recursive schema's projection. `NodeProjection` gains
`boundaries` (`ProjectionBoundary`: `recursion` on a past-the-data object
whose schemas a descendant would repeat, `budget` on an object whose members
the budget withheld), `recursiveExpansion` (the node exists only because the
projection expanded recursion past the data) and `defaultSources` (the schema
positions behind `annotations.default`). The compiler copies an object's
boundaries to `ContainerNode.boundaries`, which a binding may ignore.

`schema-defaults` initialization never writes at a node with
`recursiveExpansion` and reports it as the refusal `recursive-expansion`. A
default one of whose sources was already written above it in the same run is
refused as `recursive-default`, so a default that recreates itself is written
once and then refused. `objectChildKey(node)` returns the key every binding
uses for an object's children: the last segment of the node's data pointer, or
its node id when it has none.
