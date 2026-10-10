# ADR-009: Host Supplied External Schema Resources

## Status

Accepted

## Context

The schema adapters initially resolved local references and bundled
metaschemas. Applications also need schemas that live outside the root
document. Fetching those resources inside Texaryn would couple evaluation to a
network, authentication, cache, and trust policy that belongs to the host
application.

## Decision

Both adapters accept an optional `resolveResource(uri)` callback. The callback
receives an absolute resource URI without a fragment and may return a schema
object or boolean synchronously or asynchronously. Returning `undefined` means
the resource is unavailable. Texaryn does not fetch resources itself. Without
the callback, external references retain the existing fail closed behavior.

The adapters load resources reachable through the selected dialect's reference
keywords. A per adapter limit defaults to 128 unique resource retrieval URIs.
Applications may set `maxExternalResources` to another positive integer. A
missing resource, invalid schema value, unsupported `file:` URI, or resource
limit failure rejects adapter creation with `SchemaResourceResolutionError`.
The error includes the URI and referring schema position where available.

A retrieved document may declare a canonical `$id` that differs from its
retrieval URI. Both identifiers are registered as aliases for the same
document. Relative identifiers and references are normalized against the
canonical resource base. Caller supplied objects are copied before
normalization. Resources that declare a different supported dialect are
rejected, including embedded resources with their own `$id`.

The Hyperjump adapter builds a local schema cache for each adapter instance.
This keeps retrieved documents isolated when several adapters use the same
resource URI with different resolver results.

## Consequences

1. The host owns network access, authentication, caching, origin restrictions,
and resource trust decisions.
2. Static external `$ref` resources participate in validation and projection.
   External `$dynamicRef` and `$recursiveRef` resources can be loaded for
   validation, while form projection through their dynamic scope remains
   outside this decision, as described in ADR-007 and issue #179.
3. The default resource cap bounds work during adapter creation. Hosts can
   lower or raise it for their schema collections.
4. The conformance suite covers both adapters, remote fragments, mutually
   referring resources, canonical identifier aliases, dialect mismatches,
   conditional branches reached by references, missing resources, file URI
   rejection, and the resource limit.
