# ADR-023: First Stable Release Contract

## Status

Accepted, 2026-10-13

## Context

The planned implementation sequence through Draft-04 is complete. Twelve
packages are published independently, but each remains below 1.0.0. A stable
release needs a precise compatibility promise and a tested dependency graph. It
does not require moving every optional integration to 1.0.0.

`SchemaEvaluationPort` is exported from `@texaryn/core`. ADR-022 kept its shape
experimental before 1.0 because the Zod adapter did not provide evidence for a
general schema representation. The first stable contract must settle whether
that exported type is covered by semantic versioning.

## Decision

The first stable cohort is:

- `@texaryn/core`
- `@texaryn/schema-json`
- `@texaryn/react`

Each package publishes its own 1.0.0 version and immutable package tag. The
repository does not have an aggregate version or a repository-wide `v1.0.0`
tag. The other nine public packages remain independently versioned below 1.0
until each has its own compatibility evidence and release decision. Moving a
package's minimum supported internal dependency from a pre-1.0 line to the
stable 1.x line can exclude existing dependency graphs. That change receives
the dependent package's next pre-stable minor version. A patch release may
accept the stable dependency only when its packed ranges continue to accept
the previously supported dependency line. No dependent package becomes 1.0.0
as a side effect.

The package root exports of the three stable packages are their supported
public APIs. The current `SchemaEvaluationPort` shape and its exported types are
included in `@texaryn/core` 1.0.0. Do not redesign the port speculatively.
Future changes to stable runtime APIs follow semantic versioning. A breaking
change to a form or display document follows the family-local rules in
ADR-018.

The stable React binding supports `react` 18.3 and 19. Its package peer range
and the isolated consumer test use those supported major versions. Browser
integration tests in the release gate run in Chromium. No compatibility claim
for another browser engine is made by that test gate. React Bootstrap and React
MUI declare the same React peer range because they require the stable React
binding.

The production JSON Schema engine remains the maintained
`@texaryn/json-schema-library` fork selected in ADR-011. The Hyperjump adapter,
Zod adapter, collaboration adapter and additional renderer packages remain
separately versioned. This decision adds no schema engine, renderer or shared
plugin system.

For security fixes, the latest npm `latest` release of each public package is
supported. Earlier releases do not receive backports.

## Consequences

The stable release freezes the main documented React form path while allowing
optional adapters to mature under their own package versions. The release
workflow must prove the published tarballs install together without workspace
aliases or duplicate core versions. Dependency-only minor releases move
dependent packages to the stable 1.x dependency floor while preserving the old
pre-stable package range for users who have not opted into that dependency
change.

The release gate records the package API references, checks the supported React
versions from a fresh consumer project, validates package tarballs, runs the
JSON Schema conformance suites, and requires the repository CI checks to pass.
