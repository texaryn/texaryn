# ADR-020: Recreate Runtimes at Hydration Boundaries

## Status

Accepted, 2026-10-11

## Context

`FormRuntime` and `DocumentRuntime` contain process-local stores, subscriptions,
handlers, and pending work. A form runtime also owns array identity and
interaction state. These values are not a portable runtime snapshot.

React and Vue test DOM identifier matching when server rendering and browser
hydration reuse one runtime. Svelte derives a server-safe ID prefix from
component identity. These rules cover DOM identifiers, not how a browser
restores a runtime created in a different process. ADR-013 defines live updates
for display documents, not runtime serialization or form hydration.

## Decision

Server rendering creates initial HTML. The browser creates a fresh runtime from
the same application inputs. For a form, the host supplies the same schema,
adapter configuration, initial data, UI hints, and runtime options to both
processes. Each process creates its own `SchemaEvaluationPort`, handlers, and
renderer configuration. For a display document, the host supplies the same
versioned document and data snapshot to both processes.

Core does not serialize or hydrate runtime objects. This contract covers the
initial render only. It does not transfer dirty or touched state, validation
results, pending work, submission state, or interaction history. Creating a
runtime from current form data treats that data as its initial baseline and
starts fresh interaction state. Core does not define a saved form restoration
protocol. A product that needs to restore interaction state must specify that
contract before adding support.

The host is responsible for giving the server and browser compatible inputs and
matching framework identifier settings. Runtime reconstruction does not bypass
the document family and version checks in ADR-018.

## Consequences

Hosts can render without adding a core runtime serialization format. Each
process registers executable adapters and handlers locally. An application
cannot resume pending validation or interaction state by transferring a runtime
object. Live display updates continue to use the bounded protocol in ADR-013.

## Alternatives Considered

### Serialize the complete runtime

Rejected. Stores, subscriptions, callbacks, pending promises, and adapter code
cannot be represented by a portable JSON value. A partial encoding would imply
that omitted runtime state had been restored.

### Reuse one runtime between server rendering and browser hydration

Rejected. A server object cannot cross the process boundary. Framework
identifier matching does not change that boundary.
