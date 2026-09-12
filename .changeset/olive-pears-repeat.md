---
'@texaryn/core': minor
'@texaryn/schema-json': minor
---

Makes a disagreement between `default` declarations expressible when a
conditional branch carries one, closing #142.

`NodeProjection.defaultConflict` names the schema positions whose applicable
declarations disagree, present exactly where `AnnotationSet.default` was omitted
for that reason. Every conflict appears there, conditional or not, so a consumer
deciding what to do about a location reads one place.
`SchemaProjection.diagnostics` keeps `ambiguous-default` for the subset that
holds whatever the instance is, because a contradiction in the schema is worth
telling whoever wrote it, while one that comes and goes as a discriminator is
typed would make that channel flap.

Before this, a declaration carried by `oneOf`, `anyOf`, `if`/`then`/`else` or
`dependentSchemas` collapsed to whichever value the library's merge kept, so
the same schema and the same data produced different form data depending on
which adapter an application depended on. Measured through `createFormRuntime`
with `initialization: 'schema-defaults'`: a selected `oneOf` branch against the
base gave `'from-b'` against `'own'`, two matching `anyOf` branches gave
`'from-second'` against `'from-first'`, and a provisionally selected branch
against the base gave `'from-branch'` against `'base'`. All six now leave the
location absent and report the positions that disagreed.

Applicability for the node channel is exposure rather than validity: a
provisionally selected branch competes, though JSON Schema says it does not
apply, because ADR-003 fills from one and a disagreement has to be visible where
the fill would happen.

`@texaryn/core`'s initialization view reads conflicts from the node rather than
from the diagnostics channel. Nothing published changes shape; the diagnostics a
consumer already read are unchanged.
