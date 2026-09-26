---
'@texaryn/schema-json': minor
---

A recursive local `$ref` projects, validates and initializes. The projection
expands it once past the data, marks where it stopped with `recursion` or
`budget` boundaries, and projects at most 16 objects and 512 nodes that exist
because of the recursion, never cutting a member of a location that holds data.
Each `$ref` site resolves to one compiled target per adapter, which bounds the
cost of a large object behind one `$ref`: 500 string fields project in 5 ms on
an Apple M1 Max.

`createJsonSchemaAdapter` rejects a schema that applies itself at one instance
location with `SameLocationCycleError`, which names the position and the path.
That includes a self-application under an `if`, which constructed before and
validated only while its condition was false.

In Draft 7, `"$ref": "#"` resolves to the document root, so validation of a
recursive Draft 7 schema is correct, and the draft-07 metaschema renders the
root fields that reference the root. The fix pins an internal of
json-schema-library 11.6.2, so the dependency range is `~11.6.2`, and adapter
creation fails with an error naming that release if the internal changes.

Fields declared only under a branch the specification never evaluates (a
`then` or `else` without `if`, a `then` under `if: false`, an `else` under
`if: true`) are not projected unless a `$ref` points into the branch. Validation
runs on the schema as written, so an error only such a branch declares attaches
to no field, and `validate` returns the same result before and after a
projection.
