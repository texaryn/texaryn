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
the submitted payload, because that is what a scaffolder action reads, plus the
rendered input value and the live form data where those disagree with it. The
last of those matters: a payload alone cannot distinguish an absent key from a
key whose value is `undefined`, and that distinction is what the third reading
below turns on.

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
| branch the user activates by clicking the discriminator | **filled** |
| the same field cleared, deactivated, activated again | **not refilled** |
| a value typed into a branch that is then deactivated | **kept, and submitted** |

The uncontroversial rows are the first four. The rest are where a contract has
to make a choice, and the last six are one finding.

### The conditional rows, read three times

The first reading is that the reference contradicts itself: a `then` branch's
default is filled with no `formData` and not filled with
`formData: { flag: false }`, which describes the same instance. It does not.
`if: { properties: { flag: { const: true } } }` constrains a property it does not
require, so an absent `flag` satisfies it vacuously; adding `required: ['flag']`
makes the default disappear, which is what identifies the mechanism. Conditionals
are resolved against the data as the caller supplied it, before defaults are
filled, and are not resolved again.

That produces the defect in the twelfth row. With `flag` defaulting to `true`,
the branch does apply to the instance the form starts from, the field is
rendered, and its declared default is absent, because the initialization pass
resolved the branch before filling `flag`. A click on the discriminator produces
the value; the discriminator's own default does not. Same schema, same resulting
instance, two answers.

The second reading is that the reference nevertheless fills on activation and
does not refill a field the user cleared, which would make it a coherent
once-per-location policy with one pass in the wrong order. **That reading is
wrong, and the mechanism matters more than the conclusion.** Clearing a text
input leaves the key present with the value `undefined`, and deactivating the
branch does not remove it either. The default never returns because a present
key beats a default, not because anything recorded that the location was already
filled. `JSON.stringify` drops an `undefined` value, which is what made the
submitted payload look as though the key had gone.

So nothing in the reference tracks what it has already materialised, and its
protection against an unclearable default is that it never removes a key. The
last row is what that costs: a value typed into a branch that is then
deactivated stays in the data and reaches the submission, so a scaffolder action
can read a parameter from a branch the form no longer applies.

### Two smaller divergences

**`minItems` filling rows is a convenience, not a schema instruction.**
`minItems` constrains an instance; it does not describe one. Creating rows to
satisfy it is the reference being helpful.

**Ignoring an object-level `default` discards an ordinary annotation.** A schema
that says `default: { team: 'platform' }` on an object has stated that object's
default value. The reference applies it only in the sense that a nested
property-level declaration wins; with no nested declaration it applies nothing.

## Decision

**Schema evaluation describes defaults. An initialization policy may consume
them, once per location. Projection never mutates data.**

Concretely:

1. **Validation stays pure JSON Schema.** A default never makes a missing
   property present and never satisfies `required`. Nothing in the validation
   path changes.
2. **Projection exposes the annotation and applies nothing.** This is today's
   behaviour and it is correct. A renderer may show a default as a placeholder
   or prefill a control from it without writing to the data.
3. **`createFormRuntime` materialises nothing by default.** Given `{}`, the
   runtime's data stays `{}`.
4. **Materialisation is opt-in**, through
   `FormRuntimeOptions.initialization: 'schema-defaults'` (default `'none'`).
5. **A location is materialised the first time it becomes reachable, and never
   again.** Construction is the first reachability event, so a schema with no
   conditionals is fully materialised there and nothing happens afterwards. A
   branch the user activates later materialises the locations it reveals, once.
   The bookkeeping this needs is Texaryn's own and is not copied from the
   reference, which tracks nothing: it is what allows filling on activation
   without either refilling a field the user cleared or keeping a key alive to
   prevent the refill. Those are the only three options and the other two are
   both worse.
6. **What was materialised at construction is `state.initialData`.**
   `createFormRuntime` runs the construction pass against `options.initialData`
   and uses the result, so `handleReset` (`cmd.data ?? state.initialData`) and
   `handleSetValue`'s `modified` computation need no new code for it.
7. **`Reset` restores the construction snapshot, bookkeeping included.** The
   data returns to `state.initialData` and the set of materialised locations
   returns to what it was at construction, so a reset form behaves like a fresh
   one and re-activating a branch seeds it again. A reset form that seeds
   differently from a fresh one is the divergence that would bite later.

### Rules for the pass

From the measurements:

- **Fill only absent locations.** Absent means the property is not present;
  `false`, `0`, `''` and `null` are values and are never defaulted over.
- **Never fill a location twice**, whatever happens to its value in between.
- **Nearest declaration wins, per key.** A property-level default beats its
  container's for that key, and the container's default still supplies the keys
  no property declares: container `{ team: 'a', extra: 'x' }` with a
  property-level `team` default of `'b'` yields `{ team: 'b', extra: 'x' }`. Per
  key rather than whole-value, because whole-value discarding contradicts "fill
  only absent locations". Applying a container-level default at all diverges
  from the reference discarding it.
- **Create parent objects** needed to hold a child default.
- **Use a declared array `default` as given**, and create no rows from item
  defaults. Create no rows to satisfy `minItems`, which is a constraint rather
  than a description.
- **Resolve conditionals against the data being built, not the data as
  supplied.** Fill what the schema declares unconditionally, re-evaluate which
  branches apply against the result, fill within those, and repeat while a pass
  writes something new.

The iteration terminates because it is monotone: a pass may only fill locations
that are absent and unmaterialised, and never revisits one, so a pass that writes
nothing is the end. A recursive schema can keep revealing new locations, so the
pass count is bounded; **reaching the bound emits a diagnostic rather than
truncating silently**, which is the lesson from the applicator depth cap that
deleted valid candidates in #118.

### What this costs

The runtime carries a set of materialised pointers for the form's life, reset
with the data. Nothing in the reference needs that state, so it is a cost this
contract adds deliberately. What buys it is that the two cheaper answers both
fail: seeding on activation with no bookkeeping refills a field the user
cleared every time the branch comes back, and preventing that the way the
reference does, by never removing a key, submits values from branches that do
not apply.

A location seeded after construction is not in `state.initialData`, so it
reports `modified: true`. That is the honest answer, since the user did change
the form, but it means "modified" can be true for a field the user never typed
into. Recorded rather than hidden.

### What stays open

**Which branch counts as reachable while a discriminator is ambiguous.** A
`oneOf` the data identifies but leaves incomplete is the subject of #120, and
its two-axis `active`/`provisional` model decides whether a provisional branch's
locations are reachable for this purpose. Seeding from a provisional branch and
seeding from an active one are different promises. Not decided here, and it
blocks implementation rather than the contract.

## Consequences

An adopter who needs RJSF's payload has to ask for it, at the call site, in one
place. That is the cost, and it is the point: the request is visible rather than
implied by the schema.

For an adopter who does ask, the behaviour matches the reference on every
uncontroversial case and on the user-activated conditional that Backstage's own
documented template uses. Four divergences remain, and in all four the reference
is the one that is wrong: it discards an object-level default, it creates array
rows to satisfy a constraint rather than a description, it leaves a branch
activated by its own discriminator default unfilled while rendering the field,
and it submits values from branches that do not apply.

The fourth is not about defaults and is the widest of them. It is recorded here
because it was measured here and because it is the reason this contract pays for
bookkeeping instead of copying the reference's mechanism. Whether Texaryn's
runtime already prunes data for a deactivated branch is a separate question this
ADR does not answer.

Nothing about validation changes, so no conformance result moves.

## Alternatives rejected

**Apply defaults by default.** Matches the reference and needs no option, and it
is the failure named at the top: an annotation becoming data with nobody having
asked.

**Materialise once at construction and never again.** Simpler, and it needs no
per-location bookkeeping: the runtime holds one snapshot and reprojection is
inert. Its stated reason, that a cleared field would otherwise refill and could
not be emptied, is real. It is rejected because the bookkeeping answers that
reason at the cost of one set of pointers, while the rule itself would leave a
user-activated branch's fields empty. The reference does fill them, and the
template the adoption exercise uses is exactly that shape, so this is the one
place where the cheaper rule costs observable parity for no correctness gain.

**Keep a key alive to block the refill, as the reference does.** This is the
mechanism measured above, and it needs no bookkeeping at all. It is rejected
because the price is paid somewhere worse: a value typed into a branch that is
then deactivated stays in the data and is submitted, so a scaffolder action can
read a parameter belonging to a branch the form no longer applies. Trading a
silent data leak for a set of pointers is not a trade worth making.

**Resolve conditionals once, against the data as supplied.** This is what the
reference does, and it is one pass rather than a fixpoint. It is rejected
because the measurements show what it costs: the branch decision is taken
against an instance that initialization is about to change, so it is wrong in
both directions.

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
- Issue #120, branch selection, which decides what "reachable" means for a
  provisional branch and therefore blocks implementation
