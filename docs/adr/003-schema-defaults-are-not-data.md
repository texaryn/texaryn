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

**The version alone would not make these Backstage's behaviour.** Backstage does
not render a bare `Form`: `@backstage/plugin-scaffolder-react` 2.0.3 wraps
`withTheme(Theme)` from `@rjsf/material-ui`, and its Stepper passes
`experimental_defaultFormStateBehavior: { allOf: 'populateDefaults' }` where
RJSF's own default is `skipDefaults`. A theme substitutes widgets and templates
and cannot reach `getDefaultFormState`, but that option can, so every case below
was measured both ways. They agree on all of them, including the defect: `if` and
`then` are resolved into the schema before defaults are computed, so the `then`
properties are already merged and the `allOf` traversal setting never applies to
this shape. That equivalence is asserted in the same file rather than argued,
because without it these would be measurements of RJSF rather than of the form a
Backstage user fills in. The Stepper also passes `formData={stepsState}`, where
an untouched step's state is `{}` and not an omitted prop, and since these cases
turn on whether a property is absent that is not obviously the same input
either. It is, and that is asserted too.

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

**First reading, wrong.** The reference contradicts itself: a `then` branch's
default is filled with no `formData` and not filled with
`formData: { flag: false }`, which describes the same instance.

**Second reading, and it stands.** It does not contradict itself.
`if: { properties: { flag: { const: true } } }` constrains a property it does not
require, so an absent `flag` satisfies it vacuously; adding `required: ['flag']`
makes the default disappear, which is what identifies the mechanism. Within one
default-computation invocation, branch selection is taken against the data as it
arrived and is not recomputed after sibling defaults change that data. Stated
more strongly than that it would be wrong: the click case below shows a later
form-data update triggering another computation, so it is the single invocation
that does not iterate, not the form that never recomputes.

That produces the defect in the twelfth row. With `flag` defaulting to `true`,
the branch does apply to the instance the form starts from, the field is
rendered, and its declared default is absent, because the initialization pass
resolved the branch before filling `flag`. A click on the discriminator produces
the value; the discriminator's own default does not. Same schema, same resulting
instance, two answers. It survives Backstage's `populateDefaults`, so it is a
defect a template author meets rather than a consequence of measuring RJSF at
its own defaults.

**Third reading, wrong, and recorded because the payload alone supports it.**
The reference fills on activation and does not refill a field the user cleared,
which looks like a coherent once-per-location policy with one pass in the wrong
order. It is not one. Clearing a text input leaves the key present with the
value `undefined`, and deactivating the branch does not remove it either. The
default never returns because a present key beats a default, not because
anything recorded that the location was already filled. `JSON.stringify` drops
an `undefined` value, which is what made the payload look as though the key had
gone.

So nothing in the reference tracks what it has already materialised, and what
protects it from an unclearable default is that it never removes a key. The last
row is the same mechanism seen from the other side: a value typed into a branch
that is then deactivated stays in the data and reaches the submission.

**Texaryn's runtime behaves the same way, which is what makes this decidable
without new state.** Measured on the published `@texaryn/core` 0.7.0:
`SetValue` with `undefined` leaves the key present holding `undefined`, and
setting a discriminator so a branch stops applying leaves that branch's data in
place. So in this runtime too, a location that has been filled never becomes
absent again.

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
them. Projection never mutates data.**

1. **Validation stays pure JSON Schema.** A default never makes a missing
   property present and never satisfies `required`. Nothing in the validation
   path changes.
2. **Projection exposes the annotation and applies nothing.** A renderer may
   present a default as non-value presentation, a placeholder or a suggestion.
   **A control's value always comes from runtime data.** Putting a default into
   a control while the data stays absent would rebuild the exact divergence this
   ADR exists to remove: a value the user can see and the submission does not
   contain, which is the twelfth measured row.
3. **`createFormRuntime` materialises nothing by default.** Given `{}`, the
   runtime's data stays `{}`.
4. **Materialisation is opt-in**, through
   `FormRuntimeOptions.initialization: 'schema-defaults'` (default `'none'`).
5. **The rule is: fill a location that is reachable and absent.** Absent means
   the property is not present; `false`, `0`, `''` and `null` are values.
   Reachable means the projection exposes it given the data as it stands.
   Construction is the first moment anything is reachable, so a schema without
   conditionals is finished there; a branch the user activates later becomes
   reachable then.

   **This is the contract, and "once per location" is not.** An earlier revision
   promised a location would be materialised once and never again, and that
   promise is not one this mechanism owns: it holds only because nothing in the
   runtime currently removes a key, which is measured in
   `spikes/backstage-adoption/src/absence-reference.test.ts` and is not this
   contract's to guarantee. #126 keeps open a design that would end it. So the
   rule states what it does, and the consequence is named separately: **while
   keys are never removed, a filled location cannot become absent, so nothing is
   ever filled twice.** If that stops being true, the choice is between owning
   the state explicitly and accepting that a deleted property becomes eligible
   again, and the state would be keyed on core's stable item identity rather
   than a JSON pointer, since removing a row renumbers the pointers after it.
   **When this is implemented the invariant belongs in `packages/core`'s own
   tests**, not only in a spike the workspace CI does not run.
6. **What construction materialised is `state.initialData`**, so
   `handleSetValue`'s `modified` computation needs no new code for it.
7. **`Reset` applies the configured policy, with or without `cmd.data`.**
   `Reset` establishes a new baseline, so the policy that produced the first one
   has to produce this one: a runtime configured for `'schema-defaults'` whose
   baseline was never initialized under its own policy is incoherent. An earlier
   revision exempted `Reset` with explicit data on the reasoning that a caller
   supplying data is stating what the form holds, which has no basis, since the
   same caller supplied `initialData` at construction and asked for filling
   there. A caller who wants exact replacement needs to say so explicitly rather
   than have it inferred from passing data at all.

### Rules for the pass

- **Fill only absent locations.** Never overwrite, including `false`, `0`, `''`
  and `null`.
- **A container default is materialised whole, then recursed into.** Take
  `default: { team: 'a', extra: 'x' }` as given, then let child declarations
  fill only the keys still absent. So a property-level `team` default of `'b'`
  does **not** win: the result is `{ team: 'a', extra: 'x' }`, and it is
  `{ team: 'b', extra: 'x' }` only when the container default omits `team`.
  Per-key override was the earlier decision and is rejected: once the container
  default is materialised the child location is present, so overwriting it is a
  second precedence system rather than absence semantics, and it would be
  asymmetric with taking a declared array default as given. This diverges from
  the reference, which lets the property win.
- **Create parent objects** needed to hold a child default.
- **Take a declared array `default` as given**, create no rows from item
  defaults, and create no rows to satisfy `minItems`, which is a constraint
  rather than a description.
- **Copy every value.** An object or array default is deep-copied on each use,
  so two rows filled from one declaration share no mutable identity with each
  other or with the schema.
- **Insert a declared default exactly, including one that does not validate.**
  JSON Schema does not require a `default` to satisfy its own schema, so
  `{ type: 'integer', default: 'oops' }` materialises `'oops'` and ordinary
  validation reports it. Sanitising or skipping it would make initialization a
  second validator with its own opinion, which rule 1 exists to prevent.
- **Two applicable declarations that disagree are a diagnostic, not a
  guess.** One applicable default is used; several that are equal are used;
  several that differ leave the location absent and report it. `allOf` with two
  branches declaring different defaults for the same property has no nearest
  declaration, and resolving it by schema order would build semantics out of
  traversal order. This is the same answer `ambiguous-projection-shape` already
  gives for a shape two keyword families disagree about.

### The pass, precisely

Each pass reads one snapshot and writes once:

1. project the current data,
2. find every reachable location that is absent and has an applicable default,
3. resolve conflicts by the rule above,
4. apply those writes as one step.

Repeat until a pass writes nothing. More than one pass is needed rather than
merely tidy: `a` defaults to `true`, which reveals `b`, which defaults to
`true`, which reveals `c`. One pass after the unconditional defaults reaches
`b` and not `c`.

**Convergence is bounded and the bound is transactional.** Monotonicity alone
does not terminate, because a recursive schema can keep revealing new locations;
the reachable set has to be finite for the argument to close, and nothing
guarantees that. So initialization runs to a budget, and exceeding it **discards
the whole initialization and surfaces an error**, leaving the caller's data as
supplied. Keeping the partial writes would make the resulting data depend on the
budget, which is an arbitrary number. This also answers where the diagnostic
goes: it is an initialization failure reported to the caller, not a projection
diagnostic, so it does not touch the channel documented as describing schemas.

### What this costs

A location seeded after construction is not in `state.initialData`, so
`modified` is true for it while `dirty`, `touched` and `pristine` still report
that the user never edited that field. That combination is correct rather than
merely tolerable: the value does differ from the baseline, and the user did not
type it. The user may have changed a discriminator, or nothing at all. The four
flags together say exactly that, and all four need pinning, because carried node
interaction state is not recomputed just because the data changed.

### What stays open

**Whether a provisionally selected branch is reachable.** Rule 5 turns on
"reachable", and #120 has not settled whether a `oneOf` branch the data
identifies but leaves incomplete exposes its locations. Seeding from a
provisional branch and seeding from a settled one are different promises, so
this is a hole in the contract and not only in its implementation. **ADR-003
stays Proposed until #120 answers it**, and
`initialization: 'schema-defaults'` is not published before then.

**Root defaults.** Once initialization exists, `initialData` omitted,
`initialData: {}` and a root-level `default` are three different inputs, and the
runtime currently turns the first into the second before projection, which is
the `??` in #124. The implementation has to keep enough information to know
whether the root was actually absent, so #124 is a prerequisite rather than a
neighbour.

**An omitted `InsertItem` value.** `handleInsertItem` writes
`cmd.value ?? null`, so an insert with no value cannot be told from an insert of
an explicit `null` and the row arrives holding `null`. Under this contract
`null` is a value, so a new row could never receive its item default. Measured
and pinned in `absence-reference.test.ts`, tracked as #127, and a prerequisite:
the three cases have to become distinguishable before a row can be initialized
at all.

## Consequences

An adopter who needs RJSF's payload has to ask for it, at the call site, in one
place. That is the cost, and it is the point: the request is visible rather than
implied by the schema.

For an adopter who does ask, the behaviour matches the reference on every
uncontroversial case and on the user-activated conditional that Backstage's own
documented template uses. Four divergences remain.

Three are cases where the reference is wrong: it creates array rows to satisfy a
constraint rather than a description, it leaves a branch activated by its own
discriminator default unfilled while rendering the field, and it resolves two
equally applicable disagreeing defaults by traversal order rather than reporting
them.

The fourth is a case where the two are simply different, and it is worth being
plain about which. On an object that declares both its own `default` and a
property-level one, the reference lets the property win; this contract
materialises the container's default whole and lets property declarations fill
only what it left absent. Neither is what the reference does with a
container-only default, which it discards entirely. The contract's answer is
chosen for internal consistency with "fill only absent" rather than for parity,
so an adopter with a schema of that shape sees a different value.

One measured behaviour is deliberately **not** listed as a divergence, because
it is not one: both runtimes keep the data of a branch that has stopped
applying, and both therefore submit it. That is a question about what a
submission contains rather than about defaults, it predates this contract, and
it is tracked as #126. How that one is resolved matters here: pruning data when
a branch deactivates would end rule 5's consequence, filtering at submission
time would leave it intact.

Nothing about validation changes, so no conformance result moves.

## Alternatives rejected

**Apply defaults by default.** Matches the reference and needs no option, and it
is the failure named at the top: an annotation becoming data with nobody having
asked.

**Materialise once at construction and never again.** The first decision
written here, on the grounds that filling later would make a cleared field
refill and become unclearable. It is rejected because the premise is false in
this runtime: a cleared field keeps its key, so a later pass cannot refill it.
With the objection gone, refusing to fill on activation only buys a
user-activated branch's fields starting empty, and the template the adoption
exercise uses is exactly that shape.

**Promise once-per-location and derive it from key retention.** The second
decision written here, and the one that took a reviewer to dislodge. It is
rejected because the promise and the mechanism were not the same contract: the
mechanism fills whatever is reachable and absent, and "never again" was a
property of the runtime's retention behaviour rather than anything the rule
enforced. Publishing the stronger sentence would have made an unowned guarantee
part of the API, with its only evidence in a spike the workspace CI does not
run. Rule 5 now states the mechanism and names the consequence separately.

**Carry an explicit set of materialised locations.** The state that would make
once-per-location a real guarantee. Not rejected on the merits, and rule 5 names
the condition that would call for it: it buys nothing today, because nothing
removes a key, so it could not change an outcome.

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

**Prefilling a control from the annotation instead of materialising.** No data
mutation, no option, and no bookkeeping, which is why it is tempting. It is
rejected because it reproduces the defect: the user sees a value the submission
does not carry, which is exactly the twelfth measured row. Rule 2 permits a
default as a placeholder and forbids it as a control's value for this reason.

## Related

- Friction log entry 7, `spikes/backstage-adoption/FRICTION-LOG.md`
- Issue #124, what the runtime does with a non-object `initialData` root, found
  while measuring this and deliberately separate
- Issue #120, branch selection, which decides what "reachable" means for a
  provisional branch and therefore blocks implementation
- Issue #126, a submission carrying data from a branch that no longer applies,
  measured here; rule 5's consequence depends on how it is resolved
- Issue #127, an omitted `InsertItem` value becoming `null`, measured here and a
  prerequisite for initializing a new row
