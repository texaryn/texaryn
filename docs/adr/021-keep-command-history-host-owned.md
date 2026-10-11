# ADR-021: Keep Command History Host-Owned

## Status

Accepted, 2026-10-11

## Context

Core commands are tagged values, and `FormRuntime.subscribeMutations()` reports
data changes with before and after data and documents. It includes the command
when a dispatch changed data, but it is not a complete command feed. `Submit`,
`SetTouched`, and no-op commands do not produce a mutation when the data
reference stays the same. Core does not keep a command log. A command stream
alone does not define a portable history format: commands run against a
particular schema adapter and runtime state, and commands such as `Submit` can
invoke host side effects. Commands also do not carry inverse operations for
undo.

Applications differ in what they need to retain. Some need only the latest form
data. Others may need an audit trail, replay, undo, or collaboration. Those
choices set different retention, privacy, versioning, and effect rules.

## Decision

Command history, persistence, replay, and undo remain application-owned. Core
does not add a persistent command log or a complete command observer, and does
not promise that replaying commands across runtime or adapter versions produces
the same state or effects.

A host may use `subscribeMutations()` as an input to a data-change history. It
does not capture every command or support a complete interaction audit. A host
that needs those records must define a capture boundary. If that boundary must
observe commands dispatched by renderer code, a future core API needs an
explicit contract for accepted, rejected, no-op, and effectful commands. The
host defines how to version and redact records, how replay treats side effects,
and whether undo uses inverse domain operations or stored snapshots. Revisit a
shared core capability only when independent integrations show the same unmet
history requirement.

## Consequences

Core keeps no persistence policy, complete command feed, or undo support. Hosts
can retain only the information their product needs. The serializable shape of
a command does not imply that it is a durable event format.

## Alternatives Considered

### Keep every command in core

Rejected. A built in log would impose retention and serialization policy on all
consumers, while still needing host rules for effects, schema changes, and undo.

### Treat commands as a durable event log

Rejected. `Submit` may execute host code, commands have no inverse form, and a
command's meaning depends on the runtime and schema configuration that accepts
it.
