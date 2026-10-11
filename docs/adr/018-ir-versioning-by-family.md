# ADR-018: Scope IR Versions to Document Families

## Status

Accepted, 2026-10-11

## Context

`UIDocument` version 1 is the form IR. Version 2 is a standalone display
document with different node kinds and runtime behavior. A form document cannot
be converted into a display document without inventing presentation and data
semantics.

The roadmap's single integer and `migrateToLatest()` chain imply that version 2
is a successor format for every version 1 document. That is not true for these
two document families.

## Decision

Keep the published version 1 form and version 2 display document wire shapes.
Treat each as the first version in its own document family. Do not add a
migrator between form v1 and display v2.

When a family needs a breaking format change, identify the family as well as
the format version. The wire envelope contains a stable family name and a
family-local version. Add pure, one step migrations within that family. Run an
explicit migration on a detached document before runtime creation. A failed
migration cannot mutate its input or create a runtime. Runtimes continue to
reject unknown families, unsupported versions and missing migration steps.
Never guess how to convert between families.

If persisted documents without a family discriminator exist when this is
implemented, decode them through a dedicated legacy reader. That reader does
not imply a migration between form and display documents.

Before 1.0, formats may change under the documented pre-1.0 compatibility
contract. After 1.0, retain migration functions for at least two major versions
of each family, as stated in the roadmap's breaking change policy.

## Consequences

No runtime migrator is needed until a same-family breaking format change is
scheduled. The next format design must add an unambiguous family discriminator
alongside its version before multiple versions of one family can coexist.
Migration tests must verify input immutability, explicit errors for missing
paths and that runtime construction occurs only after a successful migration.

This amends the generic migration chain described in section 16 of the
roadmap. It does not change the accepted version 1 and version 2 wire formats.
