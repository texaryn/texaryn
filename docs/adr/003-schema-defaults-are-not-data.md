# ADR-003: Schema Defaults Are Not Data

## Status

Accepted. `FormRuntimeOptions.initialization: 'schema-defaults'` is the whole of
the published surface; the pass itself is not exported, because rule 6 makes
what it wrote the runtime's baseline and a caller able to run it over arbitrary
data could establish a baseline the runtime never agreed to.

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

**An object-level `default` is treated two ways, and only one of them is a
loss.** A schema that says `default: { team: 'platform' }` on an object has
stated that object's default value, and with no nested declaration the reference
applies nothing, which discards an ordinary annotation. With a nested
declaration it lets that one win. The first is the reference losing information;
the second is a precedence choice, and the contract below makes the opposite one
for consistency rather than because the reference is wrong about it.

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

   **Reachable is not "present in the projection".** A projection deliberately
   contains the pointers of branches that do not currently apply, which is the
   inactive-node contract: the walker keeps them so a form can show what could
   exist, and `NodeProjection.active` is the bit that says whether one applies
   now. Filling from a node merely because it is in `nodes` would seed every
   branch of every `oneOf` at once. So reachable means **the node is exposed to
   the user**, which is `active || provisional`. Construction is the first
   moment anything is reachable, so a schema without conditionals is finished
   there; a branch the user activates later becomes reachable then.

   **The second half is what #120 settled**, and the reason it is not simply
   `active` is that the two flags answer different questions. `active` says
   JSON Schema evaluation applies the node. `provisional` says the projection
   selected the branch so the user can complete it, which happens exactly
   because `oneOf` selects on full validity and a branch the data plainly
   identifies stays unselected while one of its own required properties is
   absent. A field shown to the user with a `default` the mechanism refused to
   fill is the friction this ADR exists to remove, reappearing one branch
   deeper: the user sees an empty field whose schema says what it should hold.
   Exposure is therefore the right line, and it is the same line the compiler
   already draws when it collapses the two flags into the one `visible` bit a
   binding reads.

   The narrow selection rule is what makes this safe to seed from. Only an
   explicit `const` or `enum` constrained by every branch discriminates, every
   present discriminator has to agree, and zero or several surviving branches
   select nothing, so a provisional branch is one the data identifies rather
   than one guessed at. Both adapters implement that same rule, asserted in
   `tests/conformance/provisional-selection.suite.ts`, which is what keeps
   adapter choice from changing what this mechanism writes.

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

  A conflict at an absent location also stops the pass reaching through it: see
  step 5 below, since leaving a location absent is worth nothing if a child's
  default creates it anyway.

  **The port now carries the case, for declarations that apply to every
  instance.** #128 resolved it by reporting rather than by preserving
  candidates, which was the other option considered. Where a location's own
  declaration and those reached through `allOf` and `$ref` disagree, both
  adapters omit `AnnotationSet.default` and report `ambiguous-default` with the
  schema positions that disagreed. The pass therefore finds no default at such a
  location and leaves it absent, which is this rule, without the pass having to
  resolve anything.

  What decided the shape was that the two adapters did not merge alike:
  json-schema-library kept the later declaration and @hyperjump/json-schema the
  earlier one, for the same schema. There is no value the port could report that
  both would agree on, so omission is the only answer that is not one library's
  traversal order.

  **A conditional declaration competes while its branch applies, and the port
  carries that too.** #142 settled it on a second channel rather than by
  widening the first. A declaration carried by `oneOf`, `anyOf`,
  `if`/`then`/`else` or `dependentSchemas` competes with the base only while its
  branch is selected, so whether it disagrees is a state of the data, and
  `SchemaProjection.diagnostics` describes schemas. It is reported on
  `NodeProjection.defaultConflict` instead, beside `active` and `provisional`,
  which come and go with the data for the same reason. Every conflict appears
  there, conditional or not, so this pass reads one channel; the diagnostic
  stays for the unconditional case, which is a contradiction worth telling
  whoever wrote the schema.

  **Applicability there is exposure rather than validity**, which is a small,
  deliberate divergence from JSON Schema. A provisionally selected branch does
  not validate, and this pass fills from one anyway under rule 5, so a
  disagreement it carries has to be visible where the fill would happen.

### The pass, precisely

Each pass reads one snapshot and writes once:

1. project the current data,
2. find every reachable location that is absent and has an applicable default,
3. resolve conflicts by the rule above,
4. drop any write whose location is a strict descendant of another write in this
   pass,
5. drop any write that could only be applied by creating an absent ancestor
   whose own defaults are in unresolved conflict,
6. apply the rest as one step.

Step 4 is what makes "materialised whole" true rather than merely intended.
Without it, `{}` against a schema declaring `default` at both `/owner` and
`/owner/team` yields both writes in one pass, and the pass is back to needing a
precedence rule between them. Dropping the descendant leaves `/owner` written
with its own default; the next pass reprojects, finds `/owner/team` present, and
writes nothing. When the container's default omits `team`, that next pass finds
it absent and the property-level default applies, which is the case the rule
above says should still fill.

**Step 5 exists because step 4 keys on surviving writes, and a conflict removes
one.** Take `/owner` declaring two defaults that disagree and `/owner/region`
declaring `'eu'`, against `{}`. Step 3 reports the conflict and leaves `/owner`
absent, so step 4 has no `/owner` write to shadow `/owner/region` against, and
the rule about creating parent objects to hold a child default would then
create `/owner` and produce `{ owner: { region: 'eu' } }`. That materialises,
by a side door, the location the conflict said to leave alone, and it invents a
container whose declared default nobody could choose. So an unresolved conflict
at an absent location is a barrier: nothing beneath it is filled while filling
would require creating it. Defaults elsewhere in the same pass are unaffected,
and the location stays absent with its conflict reported.

Repeat until a pass writes nothing. More than one pass is needed rather than
merely tidy: `a` defaults to `true`, which reveals `b`, which defaults to
`true`, which reveals `c`. One pass after the unconditional defaults reaches
`b` and not `c`.

**Convergence is bounded and the bound is transactional.** Monotonicity alone
does not terminate, because a recursive schema can keep revealing new locations;
the reachable set has to be finite for the argument to close, and nothing
guarantees that. So initialization runs to a budget, and exceeding it **discards
the whole initialization**, leaving the caller's data as supplied. Keeping the
partial writes would make the resulting data depend on the budget, which is an
arbitrary number.

**How that failure is delivered differs by call surface, and both are named
rather than left to the implementation.** Initialization reaches the runtime
through two call surfaces and they do not have the same shape:
`createFormRuntime` returns a value, so it **throws**, and the caller is in a
position to catch a runtime it never received. `dispatch` returns `void` and is
typically called from an event handler, where throwing takes out the host's
render, so exhaustion there **reports on a store**, alongside `submission`. Both
mean the same thing, that initialization did not happen and nothing was written,
and neither uses the projection's diagnostics channel, which is documented as
describing schemas rather than one run over data.

"Leaving the caller's data as supplied" is not the same data at every moment
`dispatch` runs the pass, and the difference follows from what the moment
establishes. A `Reset` establishes a baseline, so a `Reset` that exhausts the
budget is **refused whole**: the command does not land, and the data, the
interaction flags and the submission state are what they were. An ordinary edit
establishes no baseline, so the command lands and only the seeding is discarded;
refusing the keystroke would make the user pay for a schema they cannot see.

The store is `FormRuntime.initialization`, holding an `InitializationReport` or
`undefined` where no policy is configured. It is the kernel's result without the
data, which the runtime publishes on `data` like everything else, and it keeps
that type's two arms: a discarded run reports only that it was discarded.
Carrying the conflicts and refusals of the run that found them would say a run
found them and then say nothing was written, and those are not the same claim.

### What this costs

A location seeded after construction is not in `state.initialData`, so
`modified` is true for it while `dirty`, `touched` and `pristine` still report
that the user never edited that field. That combination is correct rather than
merely tolerable: the value does differ from the baseline, and the user did not
type it. The user may have changed a discriminator, or nothing at all. The four
flags together say exactly that, and all four need pinning, because carried node
interaction state is not recomputed just because the data changed. `NodeState`
exposes only `dirty` and `touched`, so they are pinned at the runtime and
command-state level rather than by widening the public surface for a test.

Rule 6 is about construction and does not cover this: there the pass's output
*is* the baseline, so nothing is modified against it, and `handleReset` makes
the same true of a `Reset`. Between those two, a seeding happens against a
baseline that is already fixed, and `modified` has to be computed, because
`defaultNodeState` builds every node fresh and `carryNodeState` carries the
answer from before the seeding. The pass therefore reports which locations it
wrote.

### What stays open

**Root defaults.** `initialData` omitted and `initialData: {}` are two different
inputs, and the runtime turns the first into the second before anything projects
it, so the root is present and a root-level `default` never applies. #124 read
as the prerequisite while this was Proposed, and it is not: it closed by fixing
how a non-object root is coerced, which leaves the substitution in place.

The constraint that remains is smaller and harder. Telling the two apart means
projecting `undefined`, and `undefined` is not JSON: the hyperjump adapter
refuses it at the root, which #148 established while making a cleared field
legible one level down. So the runtime would have to carry the root's absence
beside the data rather than in it. Pinned as a limitation in
`tests/conformance/schema-defaults.test.ts` and tracked as #150.

**Exact replacement on `Reset`.** Rule 7 says a caller who wants their data
installed without the policy running over it "needs to say so explicitly", and
no mechanism exists to say it. Whether one should is open; today the policy runs
on every `Reset`.

**An omitted `InsertItem` value.** `handleInsertItem` writes
`cmd.value ?? null`, so an insert with no value cannot be told from an insert of
an explicit `null` and the row arrives holding `null`. Under this contract
`null` is a value, so a new row could never receive its item default. Measured
and pinned in `absence-reference.test.ts`, tracked as #127, and a prerequisite:
the three cases have to become distinguishable before a row can be initialized
at all. Distinguishing the command's input is not the whole of it, since an
omitted element still needs a representation; a row should be initialized before
its array value becomes externally observable rather than by leaving a hole or
an `undefined` in public data.

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
- Issue #120, branch selection, which decided what "reachable" means for a
  provisional branch. Its semantics are settled and rule 5 now records them; the
  issue stays open on #121, an upstream crash in `json-schema-library` that its
  original fixture still triggers
- Issue #126, a submission carrying data from a branch that no longer applies,
  measured here; rule 5's consequence depends on how it is resolved
- Issue #127, an omitted `InsertItem` value becoming `null`, measured here and a
  prerequisite for initializing a new row, resolved by the handler naming the
  row it created rather than by reading the value back
- Issue #128, the port collapsing two disagreeing defaults, measured here and
  resolved by reporting them, for declarations that apply to every instance
- Issue #142, the same collapse for a declaration a conditional branch carries,
  resolved on `NodeProjection.defaultConflict` because that one is a state of
  the data
