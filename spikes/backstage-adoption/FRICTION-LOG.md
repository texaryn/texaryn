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
as the working alternative. I am using the **documented** form verbatim and
recording what RJSF and Texaryn each do with it. If they agree, the doc is fine
and the issue is narrower than it reads. If RJSF does not reveal the field,
that is a finding about Backstage rather than about Texaryn, and the comparison
is still the thing that establishes it.

## Standing question for the external-resource API

The roadmap has a possible PR for a JSON Schema external-resource registry.
This exercise is meant to be able to contradict that.

**Did Texaryn ever need to resolve a URI it did not already have?** Answered at
the end of this log, from what the integration actually required.

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
