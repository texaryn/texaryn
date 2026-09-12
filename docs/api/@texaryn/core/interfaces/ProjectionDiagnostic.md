[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / ProjectionDiagnostic

# Interface: ProjectionDiagnostic

One reason a pointer projects less than the schema declares: no node at all,
or a node missing something the schema states.

`code` is a stable identifier a caller can branch on; `message` is for a
person reading a log and is not a contract.

## Properties

### code

> **code**: [`ProjectionDiagnosticCode`](../type-aliases/ProjectionDiagnosticCode.md)

***

### message

> **message**: `string`

***

### pointer

> **pointer**: [`JsonPointer`](../type-aliases/JsonPointer.md)

***

### sources?

> `optional` **sources?**: readonly `string`[]

The schema positions the diagnostic is about, as JSON Pointers into the
schema document, with the root as the empty string. A position reached
through `$ref` is named by what it resolves to rather than by the reference
that pointed at it.

Present where naming the positions is the useful half of the report, which
is `ambiguous-default`: that two declarations disagree is far less
actionable than which two. Optional because the other codes describe one
schema position, already named by `pointer`.

Order is not a contract. Which order an adapter walks its own applicators
in is its own business; the set is what is being reported.
