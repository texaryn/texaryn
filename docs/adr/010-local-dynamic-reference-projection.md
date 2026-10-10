# ADR-010: Dynamic Reference Projection Uses a Bounded Opt In

## Status

Accepted for the bounded `@texaryn/schema-json` milestone tracked in #179.

## Context

The projector retains fields declared by absent and inactive branches, so one
active-path lookup cannot replace its static schema walk. Dynamic reference
resolution also depends on the evaluation scope. json-schema-library 11.6.2
mutates `ValidationPath` during reduction and reference resolution, and its
dynamic resolver can select an unrelated `$dynamicAnchor` from that path.
Runtime compilation creates additional dynamic reference nodes, including in
resources supplied by the host.

## Decision

`@texaryn/schema-json` exposes `dynamicReferenceProjection: 'local'` as an
opt in for Draft 2019-09 and Draft 2020-12. The option name means that Texaryn
does not fetch resources. External resources are available only when the host
returns them from `resolveResource`.

Draft 2019-09 supports `$recursiveRef: '#'` below object properties or
homogeneous array `items`. Draft 2020-12 supports `$dynamicRef` in the same
locations. Both forms work through `allOf`, `anyOf`, `oneOf`, conditionals and
`dependentSchemas`. The projector keeps static candidates for absent and
inactive properties, then uses the active child scope for the current
instance. The adapter applies the same scope policy to validation. If a
recursive reference's static target has no `$recursiveAnchor: true`, that
reference remains static.

The mode rejects references below unsupported applicators or array keywords,
root relative resource identifiers, and dynamic references whose targets are
not the root schema or a resource loaded by the configured resolver. Recursive
references must use `'#'`, have no siblings, and occur below a property or a
homogeneous array `items` schema. Draft 2020-12 `$recursiveRef` is unsupported.
Assertion siblings beside `$dynamicRef` are unsupported; annotation siblings
are allowed.

## Consequences

Dynamic scope aware projection remains disabled by default. The opt in mode
covers the listed schema locations only. It does not claim general dynamic
reference compliance. The evidence matrix covers local and external resource
scope, sibling isolation, inactive and absent fields, homogeneous array rows,
recursion limits, default provenance, validation parity and each documented
rejection.

Changes to json-schema-library must recheck dynamic resolution,
`compileSchema` and the scope instrumentation.
