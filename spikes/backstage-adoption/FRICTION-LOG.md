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
