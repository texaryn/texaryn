# ADR-011: Long Term JSON Schema Engine

## Status

Accepted, 2026-10-11

## Context

ADR-002 selected `json-schema-library` for Phase 1 because its form oriented
reducer produced a useful projection in one synchronous call. Earlier roadmap
research favored Hyperjump for formal annotation collection. That research was
exploratory and did not describe the adapter that shipped.

The published `@texaryn/schema-json` package is version 0.8.1 and pins
`json-schema-library` 11.6.2. The roadmap records defects in upstream releases
and a patched 11.6.2 runtime. A Texaryn fork can correct those defects at their
source while keeping Texaryn specific projection behavior in the adapter.

The fork now contains the reference registry and nested reduction fixes in
[PR #1](https://github.com/texaryn/json-schema-library/pull/1). Its GitHub test
jobs pass. Version [11.6.6 is published on npm](https://www.npmjs.com/package/@texaryn/json-schema-library/v/11.6.6)
with a matching [GitHub release](https://github.com/texaryn/json-schema-library/releases/tag/v11.6.6).
Merged monorepo PR #207 replaces upstream 11.6.2 and removes the adapter's
packaged workaround. PR #208 created `@texaryn/schema-json` 0.8.2. All release
checks passed, and its publish job awaits approval in the protected
`npm-release` environment. Published version 0.8.1 remains on the old
dependency until publishing completes.

The repository also contains a private Hyperjump adapter. It is useful for
cross implementation conformance checks, but it has different compilation and
registry lifecycle requirements, uses experimental evaluation APIs, and still
has documented projection gaps. Standard annotation collection alone does not
produce fields for an incomplete form. Texaryn must continue to combine schema
structure, instance evaluation, and its own projection rules with either
engine.

## Decision

Texaryn will use a Texaryn maintained fork of `json-schema-library` as its one
long term production JSON Schema engine. The fork will be published under the
`@texaryn` npm scope and consumed only through `@texaryn/schema-json`.

This prioritizes the form oriented reduction API and the current adapter's
integration over formal annotation collection as a standalone engine feature.
The product contract is Texaryn's documented projection behavior. The adapter
combines schema traversal with evaluation because neither engine's annotation
output alone can describe all fields in an incomplete form.

Hyperjump's strongest advantage is its standards focused evaluation model. It
does not remove the need to find declared fields that have no instance value.
Promoting it would replace the current adapter's compilation and registry path,
close documented projection gaps, and make production depend on experimental
evaluation APIs. The fork retains the shipped engine integration and fixes the
known defects where they originate.

The fork will contain general engine corrections, including the upstream
defects that block Texaryn. Texaryn form projection policy remains in
`@texaryn/schema-json`; the fork will not become a home for Texaryn specific
field selection or rendering rules.

`SchemaEvaluationPort` remains the core boundary. Its purpose is to keep the
runtime independent of engine APIs, not to promise a sequence of future engine
migrations.

The private Hyperjump adapter remains a CI comparison implementation. It is
not a production alternative, a planned migration target, or a published
package. No new Rust engine or Rust/WASM adapter is planned.

## Maintenance Policy

Keep the fork delta limited to engine defects and compatibility fixes. Track
the upstream base and incorporate relevant upstream changes. Run the fork
against the applicable official JSON Schema Test Suite cases and Texaryn's
projection conformance suite before publishing each change.

Release gates cover Draft 7 root self references across repeated projections
and separate adapter instances, failed nested `oneOf` reduction through
dependent schemas, the applicable official suite, and Texaryn's independently
specified projection cases. Reopen the fork choice if a required correction
needs sustained changes to the reference or reducer architecture, the fork
cannot meet a required JSON Schema dialect contract, it cannot receive critical
security fixes, or the product contract changes to require formal annotation
collection as its projection source. A phase boundary by itself is not a
reason to reconsider the engine.

The 11.6.6 release workflow skips publishing an already existing immutable npm
version and still creates its GitHub release. Configure npm trusted publishing
immediately before the next new fork version, then validate it with that
version's first OIDC publish.

## Consequences

Texaryn owns fork releases, upstream synchronization, and engine regression
coverage. In exchange, the production adapter keeps its current form oriented
engine model and can fix upstream defects at source. Hyperjump remains useful
as an independent comparison in CI without creating a second supported
production path. Rust language choice alone does not address the projection
rules or the reported engine defects.
