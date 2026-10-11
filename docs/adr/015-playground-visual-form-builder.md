# ADR-015: The First Visual Builder Lives in the Playground

## Status

Accepted, 2026-10-11

## Context

The roadmap defers a visual form builder until after runtime validation. The
playground already edits JSON Schema and compiles that same source through
`@texaryn/schema-json`. A first builder can test whether direct field editing
helps users without introducing a new package, schema format, or runtime API.

The JSON Schema language includes references, nested objects, conditional
applicators, enums, and constraints that a small visual editor cannot safely
rewrite. Replacing schemas with a builder's private model would discard these
features or create a second source of truth.

## Decision

Add a Visual tab beside the existing JSON tab in the private playground. The
JSON Schema text remains the sole source of truth, and every visual edit writes
back to that document. The existing adapter compiles the edited schema for the
same form preview.

Version 1 edits direct properties on an object root. It can add a string field,
edit a field title, select string, number, integer, or boolean types, toggle
`required`, and remove a supported field. New property names are generated
without collisions. Renaming an existing property is left to JSON editing so
references and other schema keywords cannot be changed implicitly.

The visual editor changes only these root keywords: `$schema`, `type`, `title`,
`description`, `properties`, `required`, and boolean `additionalProperties`.
Editable property schemas contain only `type`, `title`, and `description`.
Advanced properties remain visible as names and untouched in the source. A
schema with unsupported root structure is read only in the Visual tab and gives
the user a path to the JSON tab.

The builder is part of the playground and does not add a published package or a
new runtime abstraction. It does not generate nested layouts, enums, schema
constraints, custom widgets, or display documents. Drag-and-drop array reorder
and collaborative editing remain separate roadmap items.

## Consequences

Users can add and configure common scalar fields while seeing the same
renderer preview and JSON Schema document. Unsupported schema constructs keep
their existing representation and can still be edited in JSON mode. The
playground owns the implementation until use shows that a reusable public
builder API is needed.
