# ADR-019: Keep Extension Composition in Application Packages

## Status

Accepted, 2026-10-11

## Context

The roadmap describes one plugin setup function that receives renderer
registries, action handlers, a schema evaluator and IR transforms. Those values
do not share one runtime lifecycle. Widget registries belong to renderer
packages, action handlers belong to the host, and schema evaluators are passed
to the runtime through `SchemaEvaluationPort`.

The current APIs already let applications compose these extension points
directly. A shared plugin container would add a second configuration layer and
make packages depend on extension points they do not use.

## Decision

Do not add a universal `Plugin` interface or plugin registry to core. Keep
composition in the package or application that owns the feature:

- renderer packages add widgets through `RendererRegistry`;
- hosts provide action handlers through runtime options;
- schema packages implement `SchemaEvaluationPort`;
- feature packages may export plain setup functions for the registries they
  extend.

Do not add a general IR transform pipeline. A transform can change the
compiled document independently of schema projection, so each transform would
need a defined validation, identity and renderer contract first.

Revisit a shared plugin API only after at least two independent integrations
demonstrate the same unmet setup, lifecycle, registration, cleanup, async
failure, isolation or composition requirement. First add the smallest missing
capability to the existing extension point. Consider a shared API only when
that change cannot meet the demonstrated need. Third-party integrations do not
receive unrestricted mutable access to the complete IR by default.

## Consequences

The plugin ecosystem phase is closed without a new runtime API. Extension
packages remain composable and independently versioned. The core stays free of
framework-specific package discovery and transform lifecycle rules.
