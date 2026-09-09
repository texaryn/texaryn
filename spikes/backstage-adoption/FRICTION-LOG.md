# Backstage Software Templates: outside-in adoption exercise

An adoption exercise run from outside the project, against a real schema-driven
form system rather than a form Texaryn designed for itself.

## Acceptance test

> Replace the RJSF-backed parameter-form rendering of one non-trivial Backstage
> Software Template with Texaryn, using only published Texaryn APIs, while
> preserving the template's observable form/submission behavior.

The template has to contain at least two form steps, required and optional
fields, a nested object, an array with add/remove/reorder, a conditional choice
affecting subsequent fields, one custom field extension, a validation failure
and submit, and one remotely composed `$yaml` parameter fragment.

Observable behaviour is compared against RJSF (`@rjsf/core` +
`@rjsf/validator-ajv8` + `@rjsf/mui`, which is what the Backstage scaffolder
actually renders with) on three things per step, and nothing else:

1. which fields render;
2. the valid/invalid verdict and the error pointers, on a fixed input set;
3. the submit payload for a complete valid fill.

Markup is not compared. Those three are what the scaffolder backend and the
person filling the form can see.

## Rules this exercise runs under

- **No monorepo changes.** Every fix lands in this directory or in this log. The
  moment a step is made to pass by editing `@texaryn/*`, the exercise has
  stopped being outside-in. Findings that call for a package change are recorded
  here and left for a separate decision.
- **Published packages only**, resolved from the npm registry, not from the
  workspace. `spikes/` is deliberately a top-level directory: `pnpm-workspace.yaml`
  globs `apps/*`, `packages/*` and `tests`, and the root `vitest.config.ts`
  aliases every `@texaryn/*` specifier to `packages/*/src`. Anything placed
  under those paths would silently test the working tree instead of what
  adopters can install. This directory has its own `package.json`, its own npm
  lockfile and its own vitest config, and a test asserts the resolution is real
  (see Admissibility).
- **Friction is recorded before it is solved.** Each entry states what was
  tried, what blocked it, and which category it falls in (adapter, workaround,
  private import, duplicated state, preprocessing) *before* the resolution.
- **Provenance is explicit.** Every part of the template says whether it is
  verbatim from a real Backstage source or added for this exercise, with the
  URL. Constraints imposed by me are marked as such so the result can be
  discounted accordingly.

## The template

Base: `bui-kitchen-sink-demo/template.yaml`, fetched verbatim from
[backstage/backstage](https://github.com/backstage/backstage/blob/master/plugins/scaffolder-backend/sample-templates/bui-kitchen-sink-demo/template.yaml)
(273 lines). It supplies six steps, top-level `required`, nested-object
`required`, a nested object (`owner`), an array of objects (`contacts`,
required `name`, `role` enum, `primary` boolean), three scalar arrays, eleven
`ui:field` occurrences, and a `oneOf` on `consent`.

Verified by grep, it does **not** contain `dependencies:` and does **not**
contain `$yaml`, so two acceptance criteria are unmet by the base template.

### Evidence gathered before adding anything

Rather than compose the two missing pieces, I searched for real usage first.
GitHub code search across the whole `backstage` organisation:

| Query | Total |
| --- | --- |
| `"$yaml:" org:backstage` | 2 |
| `"$yaml:" path:*.yaml scaffolder` | 0 |
| `"dependencies:" filename:template.yaml org:backstage` | 0 |
| `"$ref" filename:template.yaml org:backstage` | 0 |

The two `$yaml` hits are `docs/features/software-templates/input-examples.md`
and `plugins/catalog-backend/src/processors/PlaceholderProcessor.test.ts`: the
documentation and the unit test. Not one template in the organisation, sample
templates included, uses `$yaml` in `spec.parameters`, and not one uses
`dependencies`. The sibling placeholder `$text` has 20 hits, all of them in
catalog entity descriptors rather than scaffolder templates.

So both missing criteria are missing from real templates too. I added them from
the official documentation, which is a real source, and marked them:

1. **Conditional** (added): the `dependencies` + `allOf` + `if`/`then` block
   from ["Use parameters as conditional for fields"](https://github.com/backstage/backstage/blob/master/docs/features/software-templates/input-examples.md),
   copied verbatim, `includeName` revealing a required `lastName`.
2. **`$yaml` fragment** (added): one of the kitchen sink's own steps moved out
   into a remote file and pulled back in with `- $yaml: <url>`, the idiom the
   same document specifies. Nothing is invented; the step content is the
   template's own.

Both are additions to a real template, not a template of my own design. The
acceptance criteria they satisfy are therefore weaker evidence than the ones
the kitchen sink supplies unaided, and should be read that way.

### The conditional idiom is documented in a form Backstage may not support

The official doc uses `dependencies` + `allOf` + `if`/`then`. Backstage
[issue #30090](https://github.com/backstage/backstage/issues/30090) reports
`allOf`/`if`-`then` as broken in the scaffolder, with `dependencies` + `oneOf`
as the working alternative. I used the **documented** form verbatim and recorded what
each side does with it.

**Answered by the exercise: the documented form works in RJSF.** With
`includeName` at its default of `true`, RJSF renders `lastName` and reports it
as required. So the documentation is correct and issue #30090 is narrower than
its title suggests, at least for a single `if`/`then` under `dependencies`. It
also means the divergence in entry 3 is Texaryn's alone and not a case of two
libraries both struggling with an idiom Backstage itself cannot support.

## Standing question for the external-resource API

The roadmap has a possible PR for a JSON Schema external-resource registry.
This exercise is meant to be able to contradict that.

**Did Texaryn ever need to resolve a URI it did not already have?** Answered at
the end of this log, from what the integration actually required. The short
version: no, not once, and the evidence says the external-resource API would
have been the wrong thing to build first.

## Friction log

Entries are appended in the order they were hit.

### 1. Texaryn's MUI binding cannot pair with the MUI that Backstage runs

**Category: blocker for the MUI binding specifically. The harness routes around
it; a real adopter could not.**

**Tried:** one npm project holding both renderers, so the comparison could run
in a single process, with `@texaryn/react-mui` and `@rjsf/mui` side by side.

**Blocked:** `npm install` fails with `ERESOLVE`. `@texaryn/react-mui@0.3.0`
peers `@mui/material@^9.0.0`; `@rjsf/mui@5.24` peers
`@mui/material@^5.2.2 || ^6.0.0`. No published `@mui/material` satisfies both.

**Then I checked what Backstage actually runs, and it is neither.**
`plugins/scaffolder-react/package.json` on `master`:

```
"@material-ui/core": "^4.12.2",
"@rjsf/core": "5.24.13",
"@rjsf/material-ui": "5.24.13",
"@rjsf/utils": "5.24.13",
"@rjsf/validator-ajv8": "5.24.13",
```

`packages/core-components/package.json` agrees: `@material-ui/core@^4.12.2`.

So the scaffolder form renders on Material UI **v4**, under the pre-rename
package name `@material-ui/core`. `@texaryn/react-mui` requires
`@mui/material@^9.0.0`: a different major *and* a different package. A team
adopting the MUI binding into a Backstage plugin cannot satisfy that peer with
the MUI their application has. They would ship a second, complete MUI copy
alongside the first. Backstage does tolerate that pattern, because its own
v4-to-v5 migration has plugins running both at once, so this is a bundle-size
and theming cost rather than an impossibility. It is still a cost that lands
entirely on the adopter.

**Correcting my own first reading of this.** I initially recorded that RJSF has
no release line reaching MUI 9. That is wrong: `@rjsf/mui@6.8.0` peers
`@mui/material@^7.0.0 || ^9.0.0`, so RJSF v6 and `@texaryn/react-mui` would
coexist. The obstacle is not RJSF's range, it is that Backstage pins RJSF
5.24.13 and MUI v4. Stated as a version floor: adopting `@texaryn/react-mui`
into the scaffolder form the way Backstage ships it today is not possible
without a second MUI; adopting it into a Backstage plugin that has already
migrated to `@mui/material` v7 or v9 is.

The pin itself is defensible. Tracking one current major is a reasonable policy
for a young package, and `^9.0.0` is not a mistake. What it encodes is that the
binding targets new applications rather than existing MUI codebases, and
Backstage is a large existing one. That is a positioning question for whoever
owns the roadmap, not a bug to fix here.

**Resolution: the comparison does not need a MUI theme at all.** `@rjsf/core@5.24.13`
peers only `react` and `@rjsf/utils`; `@rjsf/validator-ajv8@5.24.13` peers only
`@rjsf/utils`. The three observables being compared (which fields render, the
verdict and error pointers, the submit payload) come from RJSF's core and its
ajv8 validator. A theme changes markup, and markup is explicitly not compared.

So the reference side installs the exact versions Backstage pins, 5.24.13,
with RJSF's own unthemed templates and no MUI, and the whole exercise is one
npm project with `@mui/material@9` present only for the Texaryn side. That is
more faithful on what matters (the validator and the RJSF version are
Backstage's own) and it removes a dependency conflict from the harness without
pretending the conflict above does not exist.

### 2. A schema node without an explicit `type` produces no field, silently

**Category: blocker, worked around with a preprocessing pass. The most
consequential finding in the exercise.**

**Tried:** feeding each resolved step straight to
`createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })` and rendering
it, which is the whole of the integration as the published API describes it.

**Blocked:** every one of the seven steps threw

```
Error: Schema projection missing root node
```

**Cause, measured rather than guessed.** The projection is empty unless the
schema carries an explicit `type`. Probing one keyword at a time:

| Schema | Projected pointers |
| --- | --- |
| `{ properties: { a: { type: 'string' } } }` | none |
| `{ title: 'S', properties: { a: { type: 'string' } } }` | none |
| `{ required: ['a'], properties: { a: { type: 'string' } } }` | none |
| `{ type: 'object', properties: { a: { type: 'string' } } }` | `""`, `"/a"` |
| `{ type: 'object', properties: { a: {} } }` | `""` only |
| `{ type: 'object', properties: { a: { enum: ['x'] } } }` | `""` only |
| `{ type: 'object', properties: { a: { properties: { b: … } } } }` | `""` only |
| `{ type: 'object', properties: { a: { type: 'array', items: {} } } }` | `""`, `"/a"` |

The rule is the same at every depth: a node with no `type` keyword is not
projected. `properties` does not imply an object, and `enum` does not imply the
type of its members.

**Why this is the finding that matters most.** No Backstage parameter step
declares `type: object`. Not the kitchen sink's six, not the one in the
official documentation, and there is no reason for one to: `type` is not
required by JSON Schema, and `properties` alone is a valid object schema that
ajv and RJSF both handle. So the very first thing an adopter does, hand a real
template step to the adapter, fails on all of them.

**And the failure mode is worse than the failure.** At the root it throws, which
is at least loud. One level down it does not: a property whose type is left
implicit is dropped from the form with no error, no warning and a successful
render. A template with `owner: { properties: { displayName: … } }` would
render a form that silently cannot collect an owner, and would submit happily
without it. That is the shape of bug that reaches production.

Two separate things are worth deciding, and they are not the same decision:
whether to infer `type` from `properties` and `items`, and whether an
unprojectable node should be silent. The second one stands even if inference is
deliberately refused, because "this schema declares a field I cannot
represent" is information the caller can act on and currently cannot obtain.

**Resolution in the harness:** a preprocessing pass, `inferTypes`, that adds
`type: 'object'` to any node with `properties` and `type: 'array'` to any node
with `items`, recursively, before the schema reaches the adapter. It is the
minimum inference that makes Backstage's own schemas work, and it is applied
only to the Texaryn side, because RJSF needs no such help. Every field the
comparison later reports is therefore a field that survived this pass, which is
worth remembering when reading the results: without it there is no form at all.

### 3. Conditional fields: the validator honours the conditional, the form does not

**Category: blocker. No workaround attempted, because there is nothing to work
around: the behaviour is self-contradictory rather than missing.**

**Tried:** the conditional step exactly as the Backstage documentation writes
it, `dependencies` + `allOf` + `if`/`then`, with `includeName` revealing a
required `lastName`.

**Measured, per state of `includeName`:**

| `includeName` | Texaryn projection | Texaryn verdict | RJSF renders |
| --- | --- | --- | --- |
| absent | `/includeName` | valid | `includeName`, `lastName` |
| `true` | `/includeName` | **invalid, `/lastName: required`** | `includeName`, `lastName` |
| `false` | `/includeName` | valid | `includeName` |

The middle row is the finding. With `includeName` set to `true`, Texaryn's
validator evaluates the conditional correctly and reports that `/lastName` is
required. Its projection never contains `/lastName`, so the form renders no
field for it. The form therefore declares the data invalid, names a property as
missing, and offers no way to supply it. The user cannot submit and cannot fix
it.

That is worse than either alternative. Ignoring the conditional entirely would
at least be consistent, and rendering the field would be correct. Validating
against a schema the projection did not use is the one combination that
produces a form nobody can complete.

The `absent` row is correct on both sides and worth stating so it is not read
as a divergence: draft-07 `dependencies` applies only when the named property
is present, so an absent `includeName` triggers nothing. RJSF shows `lastName`
there because it applies `default: true` on mount, which makes its state the
`true` row.

### 4. The conditional idiom Backstage recommends crashes the projection

**Category: blocker.**

**Tried:** the alternative from [Backstage issue #30090](https://github.com/backstage/backstage/issues/30090),
`dependencies` + `oneOf`, which is what that issue recommends when
`allOf`/`if`/`then` misbehaves.

**Blocked:** `port.project(data)` throws.

```
TypeError: Cannot read properties of undefined (reading 'dynamicId')
  at json-schema-library/src/keywords/dependencies.ts:122
  at Object.reduceNode  json-schema-library/src/SchemaNode.ts:474
  at walk               @texaryn/schema-json/src/projection.ts:233
  at buildProjection    @texaryn/schema-json/src/projection.ts:310
  at Object.project     @texaryn/schema-json/src/adapter.ts:31
```

**The condition, minimised.** The throw happens exactly when the `oneOf` inside
`dependencies` does not resolve to exactly one matching branch:

| Branches matching | `validate` | `project` |
| --- | --- | --- |
| exactly one | valid | `""`, `/flag` |
| both | invalid | **TypeError** |
| none (branch fails its own `required`) | invalid | **TypeError** |
| exactly one, after the data satisfies `required` | valid | `""`, `/flag` |

The correlation is exact across every case tried: whenever the data is invalid
against that `oneOf`, projecting it throws. `anyOf` in the same position does
not throw, nor does a plain subschema, nor a top-level `oneOf`, so this is
specific to `oneOf` nested inside `dependencies`.

**Why the timing makes this severe.** A form's data is invalid for nearly all
of the time someone is filling it in. The revealed branch requires a field that
by definition has no value yet at the moment it is revealed, so this is not an
edge case reachable by unusual input: it is the normal path. The first
keystroke that sets the discriminator crashes the render.

**Which side is wrong.** The message comes from upstream, and
`json-schema-library` returning an unresolved node from `reduceNode` is
arguably its own defect. But the dereference is on Texaryn's side of the line:
`projection.ts` walks whatever `reduceNode` hands back without considering that
it may be undefined, and a schema being unsatisfiable is a normal state for a
form rather than an exceptional one. A guard there turns a crash into a missing
field, which is entry 3's problem rather than this one, and entry 3 is the
better problem to have. Reporting it upstream is worth doing either way, and
does not remove the need for the guard.

### 5. `ui:*` has to be lifted into a pointer-keyed map, and most of it lands nowhere

**Category: adapter, plus a set of gaps it makes visible.**

Splitting the `ui:*` keys out of the schema is not Texaryn's problem: Backstage
does it already, in `extractSchemaFromStep`, because RJSF takes them as a
separate prop. Both sides of this comparison consume the same cleaned schema.

What Texaryn needs is a second conversion, from RJSF's uiSchema to `UIHints`.
The two disagree on shape and on vocabulary: uiSchema is a tree mirroring the
schema and carrying `ui:`-prefixed keys, while `UIHints` is a flat map keyed by
JSON pointer. That conversion is `src/candidate/ui-hints.ts`, and it is an
adapter rather than a rename.

**What the conversion cannot deliver**, measured against `createMuiRegistry()`,
which dispatches on the node's type and enum and reads `widget` for exactly one
value:

| Template asks for | Result |
| --- | --- |
| `ui:widget: textarea` | honoured |
| `ui:widget: password` | text input |
| `ui:widget: color` | text input |
| `ui:widget: range` | number input |
| `ui:widget: radio` | select |
| `ui:widget: checkboxes` | generic array control, one input per element |
| `ui:widget: date`, `date-time`, `time` | text input |
| `ui:widget: file` | text input |
| `ui:widget: hidden` | **visible text input**, see entry 7 |
| `ui:field: <11 different pickers>` | text input unless a widget is registered |

Most of these are missing widgets rather than a design problem, and a template
still collects the right data through the fallback. Two are worse than a
downgrade: `checkboxes` loses the "choose from this fixed set" affordance
entirely and shows a free-text row per element, and `hidden` shows the user a
value the template intended to keep out of sight.

**One thing this exercise did not settle.** `items` is where the two hint
representations stop lining up: RJSF states a hint once for every element of an
array, and a Texaryn pointer names one element, so `/contacts/items/name` and
`/contacts/0/name` are not the same address. The kitchen sink puts no `ui:*`
inside `items`, so nothing forced a choice, and the adapter records the gap
instead of guessing at it.

**And one thing that was easier than the reference.** Texaryn puts the field's
JSON pointer directly on the input's `name`, so recovering which field an input
belongs to needs no mapping. RJSF names an input `root_owner_displayName`, and
recovering a pointer from that means splitting on underscores, which is
ambiguous the moment a property name contains one. The harness asserts no
property name does, because otherwise the comparison would be quietly wrong.

### 6. Validation: the verdict always agreed, the reported violations did not

**Category: findings, no workaround needed.**

Across seven steps and three input states each, the two sides agreed on
accept-or-reject in all 21 cases, and on the list of violations in 17. The four
differences:

| Case | Difference | Which side is right |
| --- | --- | --- |
| `format: uri` on a value with spaces | RJSF rejects, Texaryn accepts | RJSF. `json-schema-library` does not assert `uri` for any value tried, including the empty string, so this is an unimplemented format rather than leniency. `email`, `date`, `date-time` and `time` all assert. |
| `format: data-url` | RJSF rejects, Texaryn accepts | Texaryn. `data-url` is RJSF's own addition, and ignoring an unknown format is what the specification requires. The template still loses a check it was relying on. |
| `format: time` given `17:30:00` | Texaryn rejects, RJSF accepts | Texaryn, by the specification. RFC 3339 `full-time` requires an offset. But `<input type="time">` emits `HH:MM` or `HH:MM:SS` and cannot produce one, so a `format: time` field is fillable through its natural widget in RJSF and unfillable in Texaryn. Neither library has a bug; the specification and the HTML control disagree. |
| `uniqueItems` on a duplicated array | RJSF blames `/features`, Texaryn blames `/features/1` | Both defensible. It decides which field shows the message. |

ajv additionally reports the failing `if` at the root of the conditional step,
which RJSF itself surfaces on no field, so that one is reporting noise rather
than disagreement.

**Two of the differences the comparison first reported were defects in this
harness.** Both validators already attribute `required` to the absent property,
so appending `params.missingProperty` produced `/name/name` on the RJSF side;
and RJSF reports a location as `".website"` for `format` but `"name"` for
`required`, with no leading separator on the second. The `cutoffTime` fixture
was also genuinely invalid under RFC 3339, so Texaryn rejecting it was correct
and the fixture was corrected rather than the finding recorded. Worth writing
down: three of the first ten divergences were mine, which is the argument for
checking a difference before reporting it.

### 7. `default` is never applied, so a defaulted parameter is absent from the submission

**Category: finding. Not worked around: it is a documented design position, and
the exercise measures its cost rather than disputing it.**

An empty fill of the "Numbers, ranges and toggles" step submits
`{ replicas: 3, confidence: 50, enabled: true, consent: false }` through RJSF
and `{}` through Texaryn. The step comparison did not catch this, because its
fixtures fill every field and never reach a default; it needed a test of its
own.

The cost is specific to what Backstage does next. A scaffolder action reads
`${{ parameters.replicas }}`, and the template author wrote `default: 3` to
mean "3 unless someone changes it". Through RJSF the action receives 3. Through
Texaryn it receives nothing, and every action consuming a defaulted parameter
has to be changed to supply the default a second time. The kitchen sink
declares defaults on `secret`, `replicas`, `confidence`, `enabled`, `consent`,
`environment` and `includeName`.

The value is not lost from the form: `AnnotationSet.default` carries it, so a
binding could display it as a placeholder or prefill. It is absent from the
data.

Related and smaller, from the same step: `ui:widget: hidden` renders as an
ordinary visible text input. `FieldHints.hidden` exists but is deprecated and
documented as never applied, with a comment saying a visibility contract has to
be decided first. That reasoning is sound; the consequence for this template is
that `secret` is shown to the user and its default is missing, which is two
divergences from one field.

### 8. A field extension registers cleanly; its validation needs a wrapper

**Category: half no friction, half an adapter.**

`ui:field` is how a Backstage template names a custom field extension, and the
kitchen sink uses eleven. Implementing one, `EntityNamePicker`, split into two
halves that went very differently.

**Registering the component took no adapter.** `RendererRegistry.register` is
public API, `createMuiRegistry()` can be extended rather than replaced, and a
tester ranked above the type-based entries selects the field. The one thing
needed was a channel for the tester to read: `UIHints` has no notion of a field
extension, so the hint adapter carries `ui:field` across as `widget`, and the
tester matches on `node.widget === 'EntityNamePicker'`. That is a small
liberty, and it works.

**Its validation needed a wrapper around the port.** A field extension owns a
rule the schema does not express, and nothing lets a widget report a violation:
`Command` has seven variants and none of them carries an error,
`SchemaEvaluationPort` is the only source of a `ValidationResult`, and a widget
receives neither. So the rule is applied by wrapping `validate` and appending
to what it returns.

That works, and the errors reach the field and block submission, both verified.
What it costs is the property that made the extension local. The rule now lives
beside the schema instead of beside the component, so adding a second
`ui:field` means editing the wrapper too, and a wrapper that forgets a field
fails silently rather than loudly. Eleven pickers would mean eleven entries in
a list nothing checks.

### 9. Arrays: add and remove work, reorder is absent from the binding

**Category: finding.**

Add and remove both work through the rendered controls, verified on the kitchen
sink's array of objects: clicking add appends a row, clicking the first row's
remove leaves the second row's data in place rather than truncating.

Reorder is not there. `MuiArrayControl` renders a remove button per row and one
add button, and nothing else. RJSF renders move-up and move-down per row.

This is a gap in `@texaryn/react-mui` rather than in the runtime:
`@texaryn/core` exports a `MoveItem` command, `ArrayHints.canReorder` and
`moveItem`, and `@texaryn/react` exports `moveUpActionName`, so the plumbing is
complete and only the control is missing. An adopter cannot add it without
writing their own array widget, because `useArrayActions` exposes `removeName`
and `addName` and no move equivalent.

**Where Texaryn is clearly better.** Every control it renders has an accessible
name: "Remove item 1 from Contacts", "Add item to Contacts". All seven of
RJSF's array buttons have no accessible name at all, no text and no
`aria-label`, so the only thing distinguishing move-up from remove is a CSS
class. That is why this test matches RJSF on class names. A screen reader user
can operate the Texaryn form's array and cannot operate RJSF's.

### 10. Smaller packaging notes

- No `@texaryn` package lists `./package.json` in its `exports`, so the usual
  way to read an installed version programmatically fails. Minor, and it did
  cost a detour in the admissibility check.
- Every `@texaryn` package declares only an `import` condition, so a `require`
  resolution fails outright. Correct for a modern package, and worth knowing
  for Backstage specifically, whose own tooling (`@backstage/cli`, Jest) has
  needed configuration for ESM-only dependencies.

## Did Texaryn ever need to resolve a URI it did not already have?

**No. Not once.**

The evidence is threefold and points the same way each time.

**The `$yaml` mechanism resolves before a schema exists.** Backstage's catalog
replaces the placeholder while processing the Template entity, so by the time
any form layer is handed `spec.parameters`, the fragment is an ordinary inline
step and its origin is gone. The resolver test asserts exactly that: the spliced
step contains no `$yaml` and no trace of the URL it came from. Texaryn never saw
a URI, and no schema-level resolver could have participated even in principle.

**No real template uses a JSON Schema `$ref` at all.** GitHub code search for
`"$ref" filename:template.yaml org:backstage` returns zero results, across the
sample templates and everything else the organisation publishes.

**And Backstage's own processor deliberately leaves `$ref` alone**, for exactly
the reason that would matter here. From `PlaceholderProcessor.ts`, on the branch
taken when a `$`-prefixed key has no registered resolver:

> If there was no such placeholder resolver, we err on the side of safety and
> assume that this is something that's best left alone. For example, if the
> input contains JSONSchema, there may be `$ref`: `#/definitions/node` nodes in
> the document.

So a `$ref` in a Backstage template would survive placeholder processing intact
and arrive at the form layer as a JSON Schema keyword. Nobody writes one,
because RJSF resolves only local `#/...` references and a remote one would not
work there either.

**What that means for the proposed external-resource API.** It is a
standards-completeness gap, not the first adoption blocker for this user. If it
had been built before this exercise, it would have been the wrong thing built
first: nothing here would have exercised it, and the ten entries above would
still be waiting. The ordering the exercise argues for is unambiguous, and it
puts external resolution below every one of them.

## What the exercise found, in the order it should be read

The acceptance test is met. All seven steps of a real Backstage template render
through published Texaryn APIs, and of 49 step comparisons 43 are identical to
RJSF, with the six differences recorded individually and asserted exactly. Add,
remove, a nested object, a custom field extension, validation failure, submit
refusal and a remotely composed `$yaml` fragment all work.

It also found that this template could not be adopted today, for reasons that
have nothing to do with the roadmap item this exercise was scheduled to inform.

**Blockers, in the order an adopter would hit them:**

1. **No step renders at all** (entry 2). No Backstage step declares
   `type: object`, and a node without an explicit `type` is not projected. This
   is the first thing that happens. One level down it is silent: an untyped
   nested object is dropped from the form with no error, which is the shape of
   bug that reaches production.
2. **The conditional produces an unfillable form** (entry 3). The validator
   reports `/lastName` as required and the projection provides no field for it,
   so the step cannot be completed or corrected.
3. **The recommended alternative crashes** (entry 4). A `oneOf` inside
   `dependencies` throws a `TypeError` from the projection whenever the data is
   invalid against it, which for a form being filled in is the normal state.
4. **The MUI binding cannot pair with Backstage's MUI** (entry 1). The
   scaffolder runs `@material-ui/core@4`; `@texaryn/react-mui` requires
   `@mui/material@^9`.

**Costs an adopter would carry but could live with:** defaults absent from the
submission (7), no reorder control (9), one widget honoured out of eleven
`ui:widget` values (5), no non-submitting field for `Secret` (8), a wrapper for
each field extension's validation (8), `format: uri` unasserted (6).

**Where Texaryn was better than the reference:** every array control has an
accessible name where all seven of RJSF's have none (9); the field's JSON
pointer is on the input's `name`, needing no reverse mapping (5); `format: time`
is asserted correctly where ajv is lenient, and an unknown format is ignored as
the specification requires (6).

**Two things this exercise deliberately did not do.** It changed nothing in the
monorepo: every workaround lives in this directory, so no finding was quietly
made to disappear. And it did not design the fix for anything it found; each
entry states which side is wrong and what the choice is, and stops there.

**One caveat on the two added acceptance criteria.** Neither `dependencies` nor
`$yaml` appears in any real template in the backstage organisation, so the
conditional step and the remote fragment came from the official documentation
rather than from found usage. Entries 3, 4 and the `$yaml` result rest on
documented idioms applied to a real template, which is weaker evidence than the
entries the kitchen sink supplied unaided. Entries 1, 2, 5, 6, 7, 8, 9 and 10
need no such discount.
