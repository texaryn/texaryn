---
'@texaryn/schema-json': minor
---

A recursive local `$ref` projects, validates and initializes, closing #119. The
projection expands it once past the data, marks the objects above what it
withheld with `recursion` or `budget` boundaries, and projects at most 16
objects and 512 nodes that exist because of the recursion, never cutting a
member of a location that holds data. Each `$ref` site resolves to one compiled
target per adapter, which bounds the cost of a large object behind one `$ref`:
500 string fields project in 5 ms on an Apple M1 Max.

`createJsonSchemaAdapter` rejects a schema that applies itself at one instance
location with `SameLocationCycleError`, which names the position and the path.
That includes a self-application under an `if`, which constructed before and
validated only while its condition was false.

In Draft 7, `"$ref": "#"` resolves to the document root, so validation of a
recursive Draft 7 schema is correct, and the draft-07 metaschema renders the
root fields that reference the root. The fix pins an internal of
json-schema-library 11.6.2, so the dependency range is `~11.6.2`, and adapter
creation fails with an error naming that release if the internal changes.

A field behind a chain of `$ref`s, a reference to a definition that is itself a
`$ref`, now projects, where it was dropped with an `unresolved-projection-shape`
diagnostic. In Draft 7, the fields under a `oneOf` or `anyOf` wrapper around a
`$ref`, nested or not, stay projected once they hold data, where the subtree
disappeared.

Fields declared only under a branch the specification never evaluates (a `then`
or `else` without `if`, a `then` under `if: false`, an `else` under `if: true`)
are not projected unless a reference points into the branch or a schema inside
it declares an `$id`, `$anchor` or `$dynamicAnchor`. Validation runs on the
schema as written, so an error only such a branch declares attaches to no field,
and `validate` returns the same result before and after a projection.

A schema with no recursive position projects its nodes in the same order as
before, so `schema-defaults` writes the same keys in the same order. In Draft 7,
the siblings of a `$ref` take no part in schema identity, and every registry
entry json-schema-library files for its own location is pinned, so a projection
cannot replace a definition with a reduced copy that a later reference resolves
to. A `$ref` chain is followed only through sites that add nothing but
annotations, so a `type`, `format` or `enum` beside a 2019-09 or 2020-12 `$ref`
still applies. An `$anchor`, `$dynamicAnchor` or Draft 7 fragment `$id` inside
such a kept branch is a reference target, so a cycle through it is rejected and
recursion through it is bounded. An `$id` declared under both `$defs` and
`definitions` resolves as json-schema-library resolves it, a reference with a
malformed percent escape such as `#/properties/50%off` keeps its raw spelling,
and only an own property of the data counts as holding data, so a member named
`constructor` is absent at `{}`.
