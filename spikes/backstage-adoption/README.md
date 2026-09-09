# Backstage adoption exercise

An outside-in adoption exercise: the parameter form of a real
[Backstage Software Template](https://backstage.io/docs/features/software-templates/)
rendered by Texaryn instead of RJSF, and compared against RJSF on observable
behaviour.

**Read [FRICTION-LOG.md](./FRICTION-LOG.md) first.** It is the deliverable. The
code here exists to produce the evidence the log cites.

## Running it

```bash
cd spikes/backstage-adoption
npm install
npm test
```

`npm`, not `pnpm`, and deliberately outside the workspace: `pnpm-workspace.yaml`
globs `apps/*`, `packages/*` and `tests`, and the root `vitest.config.ts` aliases
every `@texaryn/*` specifier to package source. Anything under those paths would
test the working tree instead of what an adopter can install.
`src/admissibility.test.ts` fails if that ever stops being true.

The monorepo's own `pnpm test` does not run this directory: the root vitest
config enumerates its projects explicitly.

## Layout

| Path | What it is |
| --- | --- |
| `template/template.yaml` | The template. Verbatim `bui-kitchen-sink-demo` plus two marked additions. |
| `template/parameters-pickers.yaml` | One step of it, pulled out so it arrives through `$yaml`. |
| `src/backstage/` | The two preprocessing steps that belong to Backstage: placeholder resolution and the `ui:*` split. Run for both sides. |
| `src/reference/` | The RJSF side: `@rjsf/core` 5.24.13 with the ajv8 validator, the versions `plugins/scaffolder-react` pins. |
| `src/candidate/` | The Texaryn side, plus the adapters the integration needed. |
| `src/comparison.test.tsx` | The acceptance test: 49 comparisons across seven steps and three input states. |
| `src/divergences.ts` | The six differences, each with a reason and a log entry. Asserted exactly. |
| `src/findings.test.ts` | The blockers, pinned so a fix makes a test fail. |
| `src/workarounds.test.ts` | The ratchet: each workaround asserted still necessary against the installed packages, so a released fix fails a test and says to delete it. |

## What is compared

Three observables per step, and nothing else:

1. which fields render, as JSON pointers;
2. the valid/invalid verdict and the error pointers, on a fixed input set;
3. the payload a complete valid fill submits.

Markup is not compared. Those three are what the scaffolder backend receives
and what the person filling the form can see.
