---
---

Builds ADR-003's initialization view from a `SchemaProjection`, and changes the
pass's input to match what the port now reports: one value per location, and
disagreements carried separately as the schema positions that disagreed.

Nothing is published. `src/initialization/` stays out of `@texaryn/core`'s
build, because ADR-003 is Proposed and accepting it is a decision rather than a
consequence of the port being able to express it.
