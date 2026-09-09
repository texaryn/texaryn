# ADR-003: Schema Defaults Are Not Data

## Status

Proposed. The contract below is the decision being put up for review; the
initialization facility it describes is not built yet.

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
| object-level `default` on a property | ignored |
| object-level and property-level both present | property wins |
| declared array `default` | used as given |
| item default, no array default | no rows created |
| `minItems` with an item default | rows created and filled |
| branch default, `if` vacuously satisfied by absent data | filled |
| the same, once `required` makes the `if` fail | not filled |
| branch that the discriminator's own default activates | **not filled, and rendered empty** |

The uncontroversial rows are the first four. Three of the rest changed the
contract below.

**The reference resolves conditionals against the data before defaults, and
does not resolve them again after.** The last three rows are one finding. With
`if: { properties: { flag: { const: true } } }` and no data at all, the `if` is
satisfied vacuously, because `properties` constrains a property it does not
require: so the branch merges and its default is filled, even though `flag`
defaults to `false` and the branch will not apply to the instance the form
actually starts from. Add `required: ['flag']` to the `if` and the default
disappears, which is what identifies the mechanism. The third row is the same
mechanism with the sign reversed and is the one that matters: `flag` defaults to
`true`, so the branch *does* apply once initialization finishes, the field is
rendered, and its declared default is still absent, because the branch decision
was taken earlier against data where `flag` had not yet been filled. A visible
field with a declared default and an empty value is not a behaviour to
reproduce.

**`minItems` filling rows is a convenience, not a schema instruction.**
`minItems` constrains an instance; it does not describe one. Creating rows to
satisfy it is the reference being helpful.

**Ignoring an object-level `default` discards an ordinary annotation.** A schema
that says `default: { team: 'platform' }` on an object has stated that object's
default value. The reference applies it only in the sense that a nested
property-level declaration wins; with no nested declaration it applies nothing.

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
4. **Once the runtime exists, no reprojection ever fills a default.** A branch
   becoming active because the user edited a discriminator must not inject
   values, or a cleared field refills itself from its default and cannot be
   emptied, and changing a discriminator becomes a data edit.
5. **`Reset` restores the caller's data**, not a default-expanded version,
   unless the caller asked for materialisation, in which case it restores what
   was materialised. This falls out of `handleReset` using
   `cmd.data ?? state.initialData` provided materialisation happens before
   construction.
6. **Materialisation is opt-in, explicit, and happens once**, through
   `FormRuntimeOptions.initialization: 'schema-defaults'` (default `'none'`).
   `createFormRuntime` runs it against `options.initialData` and uses the result
   as `state.initialData`, so it completes before the runtime has any state and
   everything downstream treats a materialised value as ordinary caller data.
   That is what `onSubmit` needs for a scaffolder action to see it, and what
   makes a field sitting at its default report `modified: false` against
   `state.initialData` without new code.

### Rules for the facility

From the measurements:

- **Fill only absent locations.** Absent means the property is not present;
  `false`, `0`, `''` and `null` are values and are never defaulted over.
- **Never overwrite.** A location is filled at most once, ever.
- **Nearest declaration wins**, so a property-level default beats its
  container's. Where only the container declares one, apply it, which diverges
  from the reference discarding it.
- **Create parent objects** needed to hold a child default.
- **Use a declared array `default` as given**, and do not create rows from item
  defaults. Do not create rows to satisfy `minItems`, which is a constraint
  rather than a description.
- **Resolve conditionals against the data being built, not the data as
  supplied.** Fill what the schema declares unconditionally, re-evaluate which
  branches apply against the result, fill within those, and repeat while a pass
  writes something new. This is the divergence that fixes the reference's
  staleness: a branch activated by the discriminator's own default gets its
  defaults, and a branch the discriminator's default rules out does not.

The iteration terminates because it is monotone: a pass may only fill absent
locations and never overwrite, so a pass that writes nothing is the end. A
recursive schema can keep revealing new locations to fill, so the number of
passes is bounded; **reaching the bound emits a diagnostic rather than
truncating silently**, which is the lesson from the applicator depth cap that
deleted valid candidates.

All of this happens inside initialization, before the runtime exists. Rule 4
governs everything after.

### What stays open

**A branch activated by a user edit.** Filling unconditional defaults first
settles the construction-time case, including the shape Backstage's own
documented conditional uses: `includeName` defaults to `true`, so the branch
applies during initialization and anything it declares is filled then. What is
not settled is a discriminator the *user* changes later. Rule 4 says nothing is
filled, so that field starts empty. Seeding on activation instead reintroduces
the refill problem unless each location is materialised at most once ever, which
is more state, and it interacts with the provisional-selection decision in
issue #120. Not decided here.

## Consequences

An adopter who needs RJSF's payload has to ask for it, at the call site, in one
place. That is the cost, and it is the point: the request is visible rather than
implied by the schema.

Two divergences from the reference will show up as differences in the adoption
comparison, and both are cases where the reference is the one that is wrong. It
fills defaults from branches that its own discriminator defaults rule out, and
omits them from branches those defaults activate. Recording that is more useful
than matching it.

Nothing about validation changes, so no conformance result moves.

## Alternatives rejected

**Apply defaults by default.** Matches the reference and needs no option, and it
is the failure named at the top: an annotation becoming data with nobody having
asked. It would also make every recompile a candidate for injecting values.

**Resolve conditionals once, against the data as supplied.** This is what the
reference does, and it is one pass rather than a fixpoint, so it is cheaper and
cannot fail to terminate. It is rejected because the measurements show what it
costs: the branch decision is taken against an instance that initialization is
about to change, so it is wrong in both directions.

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
- Issue #120, provisional branch selection, which the user-edit question
  depends on
