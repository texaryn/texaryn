---
'@texaryn/core': minor
'@texaryn/schema-json': minor
---

Report two disagreeing applicable defaults rather than merging them

`AnnotationSet.default` is one value, so an adapter that merges before core sees
anything reported whichever declaration its merge kept. For

```ts
{
  type: 'object',
  allOf: [
    { properties: { x: { type: 'string', default: 'a' } } },
    { properties: { x: { type: 'string', default: 'b' } } },
  ],
}
```

`@texaryn/schema-json` reported `'b'` and `@texaryn/schema-json-hyperjump`
reported `'a'`. Neither is wrong, which is why neither can be the answer: in
JSON Schema two `allOf` branches are conjunctive and neither is nearer.

`/x` now projects with no `default` at all, and the projection carries an
`ambiguous-default` diagnostic naming the two schema positions that disagreed.
That is the rule `ambiguous-projection-shape` already applies to a shape two
keyword families disagree about, one level down.

Scope is declarations that apply to every instance: a location's own, and those
reached through `allOf` and `$ref`. A declaration carried by `oneOf`, `anyOf`,
`if`/`then`/`else` or `dependentSchemas` competes with the base only while its
branch applies, so whether it disagrees is a state of the data rather than a
fact about the schema, and `SchemaProjection.diagnostics` carries the latter.
Those still collapse, tracked as #142.

**Behaviour change.** A caller reading `annotations.default` for such a location
used to get a value and now gets `undefined`. That value was one library's
traversal order, so relying on it was relying on the adapter rather than on the
schema, but it is a change and this is why the bump is `minor`, which is the
break bump under 0.x.

`ProjectionDiagnostic` gains an optional `sources`, the schema positions a
diagnostic is about, as JSON Pointers into the schema document with the root as
the empty string. A position reached through `$ref` is named by what it resolves
to. Both adapters report in that form, so a diagnostic means the same thing
whichever produced it.

`@texaryn/schema-json-hyperjump` implements the same rule and gains the same
break. It is unpublished, so it carries no version here. It also returns a
`diagnostics` array for the first time, carrying `ambiguous-default` and only
that code: it detects neither shape code, so an empty array from it is not a
claim that no schema in the projection was ambiguous.

`NodeProjection.itemAnnotations.default` is unchanged and still collapses. It
describes an array's item schema rather than being an instance location, so
there is no pointer an omission there could be reported at, and the element
locations the data provides each report their own conflict.
