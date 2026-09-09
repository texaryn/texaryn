# ADR-003: Schema Defaults Are Not Data

## Status

Accepted. The contract below is decided; the initialization facility it
describes is not built yet.

## Context

`default` reaches `AnnotationSet.default` and `NodeAnnotations.default` and
stops. A form built from a schema that declares defaults therefore submits
nothing for them, which the Backstage adoption exercise recorded as friction
log entry 7: an untouched step submits `{}` where RJSF submits
`{ replicas: 3, confidence: 50, enabled: true, consent: false }`. A scaffolder
action reads `${{ parameters.replicas }}`, and the template author wrote
`default: 3` to mean "3 unless someone changes it".

The tempting fix is to apply defaults into the data. The reason not to reach for
it directly is that `default` is an annotation. JSON Schema says a default is a
suggestion to a consumer, not a value the instance has: it never makes a missing
property present and never satisfies `required`. Turning it into data silently
would make schema evaluation a data-mutation engine, which is the opposite of
the separation this codebase has been tightening.

That separation already has a precedent one level up. A projection derives a
*form shape* from structural keywords without asserting anything about the
instance's JSON Schema type, so `{ properties: … }` renders as an object and
goes on accepting a string. Defaults are the same shape of problem:

| Established | Here |
| --- | --- |
| validation type is not projection shape | a declared default is not instance data |

## What the reference implementation actually does

Measured rather than assumed, against `@rjsf/core` 5.24.13, the version
`plugins/scaffolder-react` pins. Pinned in
`spikes/backstage-adoption/src/defaults-reference.test.tsx`; the observable is
the submitted payload, because that is what a scaffolder action reads.

| Case | RJSF |
| --- | --- |
| absent scalar with a default | filled |
| a value the caller supplied | never overwritten |
| explicit `false`, `0`, `''`, `null` | all kept, never defaulted over |
| child default, parent object absent | parent created, child filled |
| object-level `default` on a property | **ignored** |
| object-level and property-level both present | property wins |
| declared array `default` | used as given |
| item default, no array default | no rows created |
| `minItems` with an item default | rows created and filled |
| unselected branch default, no `formData` | **filled** |
| unselected branch default, `formData: { flag: false }` | **not filled** |
| the branch once it applies | filled |

Two of those changed the contract below.

**The reference is not self-consistent about conditionals.** The last three rows
describe the same starting instance expressed two ways, and the default from a
branch that does not apply is filled in one and not the other. So "what RJSF
does" is not a specification for that case, and imitating it would mean
imitating an inconsistency.

**`minItems` filling rows is a convenience, not a schema instruction.**
`minItems` constrains an instance; it does not describe one. Creating rows to
satisfy it is the reference being helpful.

## Decision

**Schema evaluation describes defaults. An initialization policy may consume
them once. Projection never mutates data.**

Concretely:

1. **Validation stays pure JSON Schema.** A default never makes a missing
   property present and never satisfies `required`. Nothing in the validation
   path changes.
2. **Projection exposes the annotation and applies nothing.** This is today's
   behaviour and it is correct. A renderer may show a default as a placeholder
   or prefill a control from it without writing to the data.
3. **`createFormRuntime` does not materialise defaults.** Given `{}`, the
   runtime's data stays `{}`. This is today's behaviour and stays the default.
4. **Reprojection never applies them.** A branch becoming active must not inject
   values, or a cleared field refills itself from its default and cannot be
   emptied, and a discriminator change becomes a data edit.
5. **`Reset` restores the caller's data**, not a default-expanded version,
   unless the caller asked for materialisation, in which case it restores what
   was materialised. This falls out of `handleReset` using
   `cmd.data ?? state.initialData` provided materialisation happens before
   construction.
6. **If materialisation is wanted, it is explicit and it happens once**, before
   the runtime exists, through a facility whose name is not settled. Everything
   downstream then treats a materialised value as ordinary caller data, which is
   what `onSubmit` needs for a scaffolder action to see it, and what makes a
   field sitting at its default report `modified: false` against
   `state.initialData` without new code.

### Rules for the facility, when it is built

From the measurements, the defensible subset:

- fill only absent locations, where absent means the property is not present;
  `false`, `0`, `''` and `null` are values;
- take the declaration nearest the data location, so a property-level default
  beats a container's, matching the reference;
- create parent objects needed to hold a child default;
- use a declared array `default` as given, and do not create rows from item
  defaults;
- **do not** fill from branches that do not apply, which diverges from the
  reference in the case where the reference contradicts itself;
- **do not** create rows to satisfy `minItems`, which is a constraint rather
  than a description.

### What stays open

**A field revealed later.** Under materialise-once, a conditional field whose
branch becomes active after construction never receives its default, because
materialisation has already happened and rule 4 forbids doing it again.
Backstage's own documented conditional is exactly this shape: `includeName`
defaults to `true` and `lastName` appears only when it is. Seeding on activation
instead reintroduces the refill problem unless each location is materialised at
most once ever, which is more state and interacts with the provisional-selection
decision in issue #120. Not decided here.

## Consequences

An adopter who needs RJSF's payload has to ask for it, at the call site, in one
place. That is the cost, and it is the point: the request is visible rather than
implied by the schema.

The divergence on unselected branches is deliberate and will show up as a
difference in the adoption comparison. It is recorded rather than smoothed over,
because the alternative is reproducing a behaviour that depends on how the
caller happened to spell the same starting state.

Nothing about validation changes, so no conformance result moves.

## Alternatives rejected

**Apply defaults by default.** Matches the reference and needs no option, and it
is the failure named at the top: an annotation becoming data with nobody having
asked. It would also make every recompile a candidate for injecting values.

**Apply them in the adapter, into the schema or the projection.** The schema
would then assert something its author did not write, and validation would see
an invented value. Projection is the wrong layer for a decision about a form's
starting state.

**A host-supplied function `(annotations, pointer) => unknown`.** Maximum
flexibility, and it lets a host inject values no schema declared, which is a
larger hole than the problem being solved.

## Related

- Friction log entry 7, `spikes/backstage-adoption/FRICTION-LOG.md`
- Issue #124, what the runtime does with a non-object `initialData` root, found
  while measuring this and deliberately separate
- Issue #120, provisional branch selection, which the revealed-field question
  depends on
