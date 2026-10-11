# ADR-014: AI Generation Uses Versioned Contracts and Existing Runtimes

## Status

Accepted, 2026-10-11

## Context

The roadmap describes two AI generation paths. A model can return JSON Schema
with optional UI hints for `FormRuntime`, or a version 2 `UIDocument` with
data for `DocumentRuntime`. Both runtimes already validate their inputs. The
form adapter also reports projection diagnostics for schema content that does
not produce a complete form.

Texaryn does not depend on an AI SDK or transport. Adding a provider interface
would duplicate host responsibilities and would not make generated output
more trustworthy. A useful first deliverable should make the output contract
discoverable, show the host acceptance boundary, and prove a bounded repair
flow without a live model.

## Decision

Ship a provider-neutral AI generation kit in documentation and examples. Do not
add an AI SDK, provider interface, or AI-specific runtime package.

The version 1 generation envelope has two mutually exclusive variants:

```ts
type GenerationOutput =
  | {
      format: 'texaryn-generation'
      version: 1
      kind: 'form'
      schema: Record<string, unknown>
      hints?: UIHints
    }
  | {
      format: 'texaryn-generation'
      version: 1
      kind: 'display'
      document: UIDocumentV2
      data: JsonValue
    }
```

A downloadable Draft 2020-12 JSON Schema defines the envelope and reusable
definitions for supported UI hints, JSON values, and display document nodes.
It describes structural constraints. Texaryn runtime validation remains the
authority for relationships that JSON Schema cannot fully express, including
node ID agreement, graph reachability, collection bindings, row keys, resource
limits, and whether a form projection is complete.

Version 1 form acceptance requires an explicit supported dialect, an object
root, and at least one projected field. It preflights response depth and value
counts, then bounds schema and resolved resource complexity before compilation.
Generated schemas cannot use
`oneOf`, `anyOf`, `$dynamicRef`, or `$recursiveRef`. Local `$ref` is allowed.
External references are rejected unless their absolute HTTP or HTTPS resource
URI appears in a host supplied resource map. Mapped resources are subject to the
same complexity limits and an eight resource cap. The example does not fetch
resources. Generated schemas and mapped resources are checked against the
locally bundled metaschema for their declared dialect before adapter creation.
The subset check follows local and mapped references, including JSON Pointer
targets outside recognized schema keywords, and detects reference cycles.
Nested `$id` boundaries and named anchors are not part of version 1, which keeps
reference analysis limited to one document root per map entry.
The form is accepted only when its current projection has no diagnostics.
That policy is not a proof that every possible instance projects a complete
form: conditionals can expose fields as the user changes data, and runtime
diagnostics describe only cases the adapter detects.

The host owns model invocation, authentication, request construction, and
action authorization. It bounds response bytes before parsing. After parsing,
it validates the envelope, then accepts only the requested output kind. A form
is compiled with `createJsonSchemaAdapter`; the host rejects any projection
diagnostics before constructing `FormRuntime`. A form may start with invalid
or empty data, because validation errors are part of the form experience and
do not imply missing controls. A display output is checked against the host's
action allowlist, then passed with its data to `createDocumentRuntime`.

Generated widget names must be in a host supplied allowlist. Generated action
types must already have host registrations. Actions with arguments require a
host supplied argument validator, and authorization remains in the handler.
The JSON Schema adapter does not derive custom registry names from schema
keywords; `hints[pointer].widget` is the only generated registry selection and
the example checks it against the allowlist. Generated output never expands a
widget or action registry.

The private example accepts model output text through a host supplied callback.
It preflights JSON depth and value counts before parsing, caps the response at
262,144 characters, and allows at most two repair
attempts after the initial request. It returns a runtime only after all
acceptance checks pass. Feedback contains at most eight bounded diagnostics.
Deterministic fixtures cover both output kinds, projection gaps, invalid
pointers, graph errors, invalid collection keys, unsupported hints, and action
registration. They make no live model calls.

## Consequences

Applications can use any local or remote model by implementing the callback
in host code. The schema, prompt instructions, and acceptance sequence can be
reviewed and versioned without tying Texaryn to a provider. The runtime remains
the final validation boundary.

The first kit does not include provider SDKs, streaming, conversation state,
autonomous action execution, visual form generation, schema independent
editable fields, model benchmarks, or a general prompt orchestration layer.
Add a package only if later use demonstrates shared implementation beyond the
contract, example, and existing runtime APIs.
