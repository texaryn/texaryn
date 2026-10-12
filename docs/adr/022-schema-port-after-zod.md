# ADR-022: Keep the Schema Evaluation Port Experimental After Zod

## Status

Accepted, 2026-10-12

## Context

Principle P2 deferred generalization until a second schema adapter exercised
`SchemaEvaluationPort`. The published `@texaryn/schema-zod` 0.1.2 package now
implements that port. It converts a Zod input schema to JSON Schema for
projection, delegates projection to `@texaryn/schema-json`, and keeps Zod's
asynchronous parser as the validation authority. Its `validateAt` filters Zod
validation results by instance pointer. It does not expose `projectSubmission`
because Zod parsing and object policies can differ from JSON Schema branch
projection.

This exercises the port's ability to combine JSON Schema projection with a
separate validation authority. It does not exercise an independent projection
from a non-JSON schema model. `SchemaProjection`, `ProjectionOptions`, and
validation keyword mapping remain shaped by JSON Schema behavior.

Zod support satisfies P2's second-adapter review trigger. The result of that
review is that current integrations do not justify generalizing the port.

## Decision

Keep the current `SchemaEvaluationPort` shape and its experimental pre-1.0
status. Treat `@texaryn/schema-zod` as Zod validation over a JSON Schema
projection. Do not add a common schema representation or generalize projection
options based only on this adapter.

Revisit the port when a supported integration requires projection semantics
that cannot be represented faithfully through the current boundary. Any
proposed generalization must be justified by that concrete adapter behavior.

## Consequences

The Zod adapter keeps the documented limitation that unsupported projection
constraints may be omitted when `unrepresentable: 'any'` is selected, while
validation still uses Zod. No core API change is needed. A future direct schema
adapter may provide evidence for a different projection contract.
