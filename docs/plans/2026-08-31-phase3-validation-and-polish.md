# Phase 3: Validation and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove SchemaEvaluationPort is implementation-independent with a second adapter, add live validation orchestration (blur/change/submit triggers with debounce and stale-result protection), wire accessible error presentation, harden the submission lifecycle, and prepare documentation for a 0.1.0 stable release.

**Architecture:** The second schema adapter (`@texaryn/schema-json-hyperjump`) implements SchemaEvaluationPort using `@hyperjump/json-schema`, a library with a fundamentally different integration model: async preparation via `registerSchema` / `getSchema` / `compile`, synchronous evaluation via `interpret`, a custom `EvaluationPlugin` for data-driven keyword collection, and a bounded static schema walk for unfilled-but-active fields. A factory-parametrized conformance suite in the `tests` workspace runs identical cases against both adapters. Validation orchestration lives in the runtime's effect executor (never in command handlers). Error display policy is a core concern; ARIA wiring is a React concern.

**Tech Stack:** @hyperjump/json-schema (1.x), vitest, @changesets/cli v3, typedoc

**Spec:** ROADMAP.md sections 8 (Validation Architecture), 9 (Schema Evaluation Architecture), 10 (Renderer Contract), lines 1895-2094 (Phase 3 tasks)

## Global Constraints

- Exports are additive only during this phase. Do not remove or rename any export from an `index.ts`. New exports are allowed.
- Angular commit conventions for all commits.
- No dash punctuation (no em dashes, no en dashes) in any prose, commit message, or PR description.
- Changesets required for every PR that changes published package code. The fixed version group `[@texaryn/core, @texaryn/schema-json, @texaryn/react]` keeps all three packages at the same version.
- `@texaryn/schema-json-hyperjump` is added to the changesets `ignore` list for P3.1 (not published yet). Publishing it requires a manual npm placeholder publish and Trusted Publisher configuration that are out of scope for this phase.
- `ValidationError.message` is optional (`message?: string`). The port contract does not require human-readable messages. Adapters that provide them (jsl) set the field; adapters that do not (hyperjump) omit it. Conformance tests must never assert on message content.
- `ValidationError.params` shape is adapter-specific. Conformance tests assert on `instancePointer` and `keyword` only.
- SSH for all git operations. No HTTPS pushes.
- No `Co-Authored-By` or agent attribution in commits or branch names.
- Plans saved to `docs/superpowers/plans/` (gitignored). Not committed.

---

### Task 1: P3.1 Second SchemaEvaluationPort Adapter (PR #19)

**Goal / acceptance criteria:**

A `@texaryn/schema-json-hyperjump` package implements `SchemaEvaluationPort` using `@hyperjump/json-schema`. A shared conformance suite in the `tests` workspace runs identical projection and validation cases against both adapters and both pass. The adapter handles draft-07, 2019-09, and 2020-12 schemas, including `if/then/else`, `oneOf`/`anyOf` discrimination, `dependentSchemas`, and local `$ref` (including recursive). The spike's four documented integration gaps are closed.

**Library choice: @hyperjump/json-schema**

This is the library not chosen for PR #7 (the spike evaluated both and selected json-schema-library for Phase 1). It is the right second adapter because its integration model differs from jsl at every layer that matters for proving the port:

1. **Async preparation, sync evaluation.** jsl's `compileSchema()` is synchronous; hyperjump's `registerSchema` + `getSchema` + `compile` pipeline is async. The adapter factory must `await` preparation, then hand back an object whose `project()` and `validate()` are synchronous calls to `interpret()`. This exercises the port's `MaybePromise` return type on `validate()` from the opposite direction: jsl returns a plain value, hyperjump could return either (the adapter wraps `interpret` synchronously, but the factory is async, confirming the port's async-factory/sync-call pattern is adapter-independent).

2. **Two-pass projection.** jsl builds a projection from a single `toDataNodes()` call that walks both schema and instance data together. Hyperjump requires two passes: (a) a data-driven pass using a custom `EvaluationPlugin` that records keyword evaluations during `interpret()`, then resolves each keyword's raw value by JSON Pointer lookup into the original schema document; (b) a bounded static schema walk that adds nodes for declared-but-currently-unfilled fields (optional properties, active conditional branches where the user hasn't typed anything yet), gated by which combinator branches the data-driven pass proved active. This two-pass design is the core architectural difference: it proves `project()` can be implemented by genuinely different strategies, not just different libraries calling equivalent single-pass APIs.

3. **Spec-formal annotation collection.** jsl resolves annotations by matching keywords to a lookup table. Hyperjump's `EvaluationPlugin` uses `beforeSchema`/`afterSchema` scope gating (a schema scope's collected records merge into the parent only when that scope validated), giving automatic annotation suppression for failed oneOf/if branches as a structural property of the evaluation. This is architecturally distinct from jsl's "validate, then match errors to nodes" approach.

4. **BASIC error output.** Hyperjump's BASIC output format provides `{ keyword, instanceLocation, absoluteKeywordLocation }` per error, with no human-readable message. The keyword is a full URI (`https://json-schema.org/keyword/minLength`) requiring trailing-segment extraction. Instance location is `#/path` requiring `#` stripping. This contrasts with jsl's coded messages and `KEYWORD_BY_CODE` lookup table.

**Dismissed alternatives:**
- **AJV:** No annotation collection API; `project()` cannot be implemented. Also CSP-unsafe (uses `new Function`).
- **@cfworker/json-schema:** No annotation collection; same `project()` blocker. Smaller community, less dialect coverage.

**Packages touched:**
- Create: `packages/schema-json-hyperjump/` (new package, not published this phase)
- Create: `tests/conformance/` directory (shared conformance suite inside the existing `tests` workspace, `@texaryn/binding-spikes`)
- Modify: `.changeset/config.json` (add `@texaryn/schema-json-hyperjump` to `ignore` list)
- Modify: `pnpm-workspace.yaml` (no change needed, `packages/*` glob already covers new package; `tests` already listed)

**Public API changes:**

New package exports (not published to npm yet):
```typescript
// packages/schema-json-hyperjump/src/index.ts
export { createHyperjumpAdapter } from './adapter.js'
export type { HyperjumpAdapterConfig } from './types.js'
```

No changes to `@texaryn/core`, `@texaryn/schema-json`, or `@texaryn/react` exports.

**Architecture boundaries:**

- The adapter depends on `@texaryn/core` for types only (SchemaEvaluationPort, SchemaProjection, NodeProjection, ValidationResult). It must not import runtime, commands, IR compiler, or React code.
- The adapter must not expose any hyperjump-specific types through SchemaEvaluationPort. The factory returns `SchemaEvaluationPort`, not a hyperjump-specific subtype.
- The conformance suite in `tests/conformance/` imports the port type from `@texaryn/core` and each adapter's factory. It must not import adapter internals.
- Hyperjump's schema registry is module-global. The adapter must generate a unique URI per adapter instance (e.g. `urn:texaryn:${crypto.randomUUID()}`) to prevent test collisions when multiple adapters coexist in the same process.

**Implementation slices:**

- [ ] **Step 1: Scaffold the package**

Create `packages/schema-json-hyperjump/` with:

```
packages/schema-json-hyperjump/
  package.json
  tsconfig.json
  src/
    index.ts
    adapter.ts
    types.ts
    projection.ts      # buildProjection (two-pass: plugin + static walk)
    validation.ts       # mapErrors (BASIC output -> ValidationResult)
    plugin.ts           # ProjectionPlugin (EvaluationPlugin implementation)
    static-walk.ts      # bounded schema walk for unfilled fields
    pointer-utils.ts    # schemaFragment, instancePointerFromUri, keywordNameFromId
    __tests__/
      adapter.test.ts
```

`package.json`:
```json
{
  "name": "@texaryn/schema-json-hyperjump",
  "version": "0.1.0-alpha.0",
  "private": true,
  "description": "Hyperjump JSON Schema adapter for Texaryn",
  "type": "module",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/texaryn/texaryn.git",
    "directory": "packages/schema-json-hyperjump"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "dependencies": {
    "@texaryn/core": "workspace:*",
    "@hyperjump/json-schema": "^1.17.8"
  },
  "scripts": {
    "build": "tsc --build",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

Note `"private": true` since this package is not published this phase.

- [ ] **Step 2: Run `pnpm install` to verify dependency resolution**

Run: `pnpm install`
Expected: Clean install. `@hyperjump/json-schema` resolves to 1.x.

- [ ] **Step 3: Add to changesets ignore list**

In `.changeset/config.json`, add `"@texaryn/schema-json-hyperjump"` to the `ignore` array (alongside `@texaryn/demo`).

- [ ] **Step 4: Implement pointer utilities**

`packages/schema-json-hyperjump/src/pointer-utils.ts`:

```typescript
export function schemaFragment(schemaUri: string): string {
  const hashIndex = schemaUri.indexOf('#')
  return hashIndex === -1 ? '' : schemaUri.slice(hashIndex + 1)
}

export function instancePointerFromUri(instanceUri: string): string {
  const hashIndex = instanceUri.indexOf('#')
  const fragment = hashIndex === -1 ? '' : instanceUri.slice(hashIndex + 1)
  return fragment === '' ? '' : decodeURI(fragment)
}

export function keywordNameFromId(keywordId: string): string {
  return keywordId.slice(keywordId.lastIndexOf('/') + 1)
}

export function resolveJsonPointer(doc: unknown, pointer: string): unknown {
  if (pointer === '' || pointer === '/') return doc
  const parts = pointer
    .split('/')
    .slice(1)
    .map((p) => decodeURIComponent(p).replace(/~1/g, '/').replace(/~0/g, '~'))
  let cur: unknown = doc
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined
    cur = Array.isArray(cur)
      ? (cur as unknown[])[Number(part)]
      : (cur as Record<string, unknown>)[part]
  }
  return cur
}
```

- [ ] **Step 5: Implement the EvaluationPlugin**

`packages/schema-json-hyperjump/src/plugin.ts`:

Port the `ProjectionPlugin` from `spike/hyperjump-probe.ts` (lines 189-223) into a clean module. The plugin records every keyword evaluated during `interpret()`, gated by `beforeSchema`/`afterSchema` scope propagation (records from a failing schema scope never surface).

```typescript
import type { EvaluationPlugin, ValidationContext } from '@hyperjump/json-schema/experimental'
import * as Instance from '@hyperjump/json-schema/instance/experimental'
import { keywordNameFromId, schemaFragment, instancePointerFromUri } from './pointer-utils.js'

export interface KeywordRecord {
  keywordName: string
  keywordId: string
  schemaUri: string
  instancePointer: string
}

interface ProjectionContext extends ValidationContext {
  scopeRecords?: KeywordRecord[]
}

export class ProjectionPlugin implements EvaluationPlugin<ProjectionContext> {
  readonly id = 'https://texaryn.dev/plugins/projection'
  readonly records: KeywordRecord[] = []
  private stack: KeywordRecord[][] = []

  beforeSchema(
    _url: string,
    _instance: unknown,
    context: ProjectionContext,
  ): void {
    context.scopeRecords = []
    this.stack.push(context.scopeRecords)
  }

  afterKeyword(
    node: readonly [string, string, unknown],
    instance: unknown,
    _context: ProjectionContext,
    _valid: boolean,
    schemaContext: ProjectionContext,
  ): void {
    const [keywordId, schemaUri] = node
    schemaContext.scopeRecords!.push({
      keywordName: keywordNameFromId(keywordId),
      keywordId,
      schemaUri,
      instancePointer: instancePointerFromUri(Instance.uri(instance)),
    })
  }

  afterSchema(
    _url: string,
    _instance: unknown,
    _context: ProjectionContext,
    valid: boolean,
  ): void {
    const mine = this.stack.pop()!
    if (valid) {
      const parent = this.stack[this.stack.length - 1]
      if (parent) parent.push(...mine)
      else this.records.push(...mine)
    }
  }
}
```

- [ ] **Step 6: Implement static walk (closing spike gaps)**

`packages/schema-json-hyperjump/src/static-walk.ts`:

Port and extend the static walk from `spike/hyperjump-probe.ts` (lines 337-378). Close the four spike gaps:

1. **Follow `$ref`:** Resolve `$ref` pointers against `$defs` (and draft-07 `definitions`) in the raw schema document. Track visited `$ref` targets to prevent infinite recursion (a Set of schema-pointer strings).
2. **Recurse into `items`/`prefixItems`:** For arrays with existing instance data, walk `items` (or `prefixItems` entries) for each existing array element. For arrays with no data, emit the array container node but not item nodes (item count is data-driven).
3. **Keyword extraction:** Already handled by the data-driven pass; the static walk only fills gaps for unfilled fields.
4. **Unique URN per instance:** Handled in the adapter factory (Step 8).

The function signature:
```typescript
export function staticWalk(
  schema: unknown,
  data: unknown,
  pointer: string,
  active: boolean,
  isBranchActive: (pointer: string, suffix: string) => boolean,
  nodes: Map<string, NodeProjection>,
  visited: Set<string>,
  rootSchema: unknown,
): void
```

Key additions over the spike:
- `$ref` resolution: when `schema.$ref` is a JSON Pointer fragment (`#/...`), resolve against `rootSchema`, push the pointer to `visited`, walk the resolved schema, then remove from `visited`.
- `items`/`prefixItems` for filled arrays: count items from `data` at this pointer, walk `items` subschema for each index present.
- `definitions`/`$defs` support for draft-07 compatibility.

- [ ] **Step 7: Implement buildProjection (two-pass)**

`packages/schema-json-hyperjump/src/projection.ts`:

Combine the data-driven plugin pass and the static walk into a single `buildProjection` function. Port from `spike/hyperjump-probe.ts` (lines 230-437) with the gap closures from Step 6.

```typescript
import type { CompiledSchema } from '@hyperjump/json-schema/experimental'
import type { SchemaProjection, NodeProjection, JsonPointer } from '@texaryn/core'
import { interpret, BASIC } from '@hyperjump/json-schema/experimental'
import * as Instance from '@hyperjump/json-schema/instance/experimental'
import { ProjectionPlugin } from './plugin.js'
import { staticWalk } from './static-walk.js'
import { schemaFragment, resolveJsonPointer } from './pointer-utils.js'

export function buildProjection(
  rawSchema: unknown,
  compiled: CompiledSchema,
  data: unknown,
): SchemaProjection {
  // Pass 1: data-driven keyword collection via plugin
  const plugin = new ProjectionPlugin()
  interpret(compiled, Instance.fromJs(data), { outputFormat: BASIC, plugins: [plugin] })

  // Group records by instance pointer, populate nodes from keyword values
  // ... (logic from spike lines 385-428)

  // Pass 2: static schema walk to backfill unfilled-but-active fields
  staticWalk(rawSchema, data, '', true, makeBranchChecker(plugin), nodes, new Set(), rawSchema)

  return { nodes: nodes as Map<JsonPointer, NodeProjection> }
}
```

- [ ] **Step 8: Implement the adapter factory**

`packages/schema-json-hyperjump/src/adapter.ts`:

```typescript
import type { SchemaEvaluationPort, ValidationResult, JsonPointer } from '@texaryn/core'
import { registerSchema as registerSchema2020 } from '@hyperjump/json-schema/draft-2020-12'
import { registerSchema as registerSchema07 } from '@hyperjump/json-schema/draft-07'
import { compile, getSchema, interpret, BASIC } from '@hyperjump/json-schema/experimental'
import * as Instance from '@hyperjump/json-schema/instance/experimental'
import type { HyperjumpAdapterConfig } from './types.js'
import { buildProjection } from './projection.js'
import { instancePointerFromUri, keywordNameFromId } from './pointer-utils.js'

export async function createHyperjumpAdapter(
  schema: Record<string, unknown>,
  config?: HyperjumpAdapterConfig,
): Promise<SchemaEvaluationPort> {
  const id = `urn:texaryn:${crypto.randomUUID()}`
  const dialect = detectDialect(schema, config)

  const register = dialect === 'draft-07' ? registerSchema07 : registerSchema2020
  register(schema, id)

  const schemaDoc = await getSchema(id)
  const compiled = await compile(schemaDoc)

  return {
    project(data: unknown) {
      return buildProjection(schema, compiled, data)
    },

    validate(data: unknown): ValidationResult {
      const output = interpret(compiled, Instance.fromJs(data), BASIC) as {
        valid: boolean
        errors?: Array<{ keyword: string; instanceLocation: string }>
      }
      return {
        valid: output.valid,
        errors: (output.errors ?? []).map((e) => ({
          instancePointer: instancePointerFromUri(e.instanceLocation) as JsonPointer,
          keyword: keywordNameFromId(e.keyword),
          params: {},
        })),
      }
    },
  }
}
```

Note: `validate()` returns a plain value (synchronous), not a Promise. The async work happened in the factory. This is the inverse of jsl (where both factory and methods are sync), and both patterns fit `MaybePromise<ValidationResult>`.

- [ ] **Step 9: Write adapter unit tests**

`packages/schema-json-hyperjump/src/__tests__/adapter.test.ts`:

Mirror the test structure of `packages/schema-json/src/__tests__/adapter.test.ts`, using the same fixture schemas. Test:
- Flat object projection: all five fields present with correct type, format, constraints, annotations, children
- Conditional projection (if/then/else): correct active/inactive flags flip with data
- oneOf discrimination: correct branch activation, annotation suppression on non-matching branch
- Local $ref resolution: nodes through $ref have correct type and annotations
- Recursive $ref: projection follows recursive $defs to depth of instance data
- dependentSchemas: cvv active only when creditCard present
- Validation: correct instancePointer and keyword for minLength, required, minimum errors
- Validation: valid data returns `{ valid: true, errors: [] }`
- Draft-07 schema: adapter detects dialect from `$schema` and evaluates correctly
- Unique URN: two adapter instances for the same schema do not collide

- [ ] **Step 10: Create the shared conformance suite**

`tests/conformance/schema-port.suite.ts`:

A factory-parametrized test suite that receives `(schema, config?) => Promise<SchemaEvaluationPort>` and runs identical cases against both adapters. The `.suite.ts` extension exports the function without being collected as a test file by vitest.

```typescript
import { describe, it, expect } from 'vitest'
import type { SchemaEvaluationPort, SchemaProjection, JsonPointer } from '@texaryn/core'

type AdapterFactory = (
  schema: Record<string, unknown>,
) => Promise<SchemaEvaluationPort>

export function schemaPortConformanceSuite(
  name: string,
  factory: AdapterFactory,
) {
  describe(`SchemaEvaluationPort conformance: ${name}`, () => {
    // projection tests
    it('projects a flat object with type, constraints, annotations, and children', async () => { /* ... */ })
    it('projects conditional branches with correct active flags', async () => { /* ... */ })
    it('suppresses annotations from non-matching oneOf branches', async () => { /* ... */ })
    it('follows local $ref into $defs', async () => { /* ... */ })
    it('handles dependentSchemas activation', async () => { /* ... */ })
    it('projects unfilled-but-active optional fields', async () => { /* ... */ })

    // validation tests
    it('returns valid: true for conforming data', async () => { /* ... */ })
    it('returns errors with instancePointer and keyword for violations', async () => { /* ... */ })
    it('maps nested errors through $ref', async () => { /* ... */ })

    // normative contract: what the port guarantees
    it('does not require message on ValidationError', async () => {
      // Validate invalid data, check that errors have instancePointer and keyword
      // Do NOT assert on message content
    })
  })
}
```

`tests/conformance/schema-port.test.ts` (the runner; vitest collects this file):
```typescript
import { schemaPortConformanceSuite } from './schema-port.suite.js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

schemaPortConformanceSuite('json-schema-library', (schema) =>
  createJsonSchemaAdapter(schema),
)
schemaPortConformanceSuite('@hyperjump/json-schema', (schema) =>
  createHyperjumpAdapter(schema),
)
```

Note: `createJsonSchemaAdapter` is already async (returns `Promise<JsonSchemaAdapter>`), so the factory signature is symmetric.

No separate `package.json` is needed: these files live inside the existing `tests/` workspace (`@texaryn/binding-spikes`). Add the adapter dependencies to `tests/package.json`:

```json
{
  "dependencies": {
    "@texaryn/core": "workspace:*",
    "@texaryn/schema-json": "workspace:*",
    "@texaryn/schema-json-hyperjump": "workspace:*"
  }
}
```

- [ ] **Step 11: Add conformance tests to CI**

Verify the conformance tests run as part of `pnpm test`. The `tests/` workspace already participates in the root test command. If it does not, add `"test:conformance": "pnpm --filter @texaryn/binding-spikes test"` to the root `package.json` and wire it into the `test` script.

- [ ] **Step 12: Run full test suite, verify both adapters pass conformance**

Run: `pnpm test`
Expected: All existing tests pass. Conformance suite passes for both adapters.

- [ ] **Step 13: Commit**

```bash
git add packages/schema-json-hyperjump/ tests/conformance/ tests/package.json .changeset/config.json
git commit -m "feat: add @hyperjump/json-schema adapter and shared conformance suite

Implements SchemaEvaluationPort using @hyperjump/json-schema with a
two-pass projection (EvaluationPlugin for data-driven keyword collection,
bounded static walk for unfilled fields). Both adapters pass the same
factory-parametrized conformance suite.

Package is private (not published). Added to changesets ignore list."
```

**Tests / conformance cases:**

Adapter unit tests (at least 12 cases):
- Flat object projection completeness (type, format, constraints, annotations, children, active)
- Conditional if/then/else branch activation (both directions)
- oneOf discrimination with annotation suppression
- Local $ref (non-recursive and recursive)
- dependentSchemas activation
- Validation error mapping (instancePointer, keyword)
- Valid data returns clean result
- Draft-07 dialect detection and evaluation
- Unique URI generation (no registry collision)
- Unfilled optional field appears with active: true

Shared conformance suite (at least 9 cases): listed above in Step 10. Both `@texaryn/schema-json` and `@texaryn/schema-json-hyperjump` must pass every case.

**Changeset impact:**

No changeset needed. The new package is private and in the `ignore` list. Existing published packages are unchanged.

**Dependencies on previous P3 work:**

None. This is the first P3 task.

**Explicit non-goals:**
- Publishing `@texaryn/schema-json-hyperjump` to npm. Requires manual placeholder publish + Trusted Publisher configuration (org texaryn, repo texaryn, workflow ci-release.yml, environment npm-release). Tracked for a future phase.
- Adding the package to the changesets fixed group or `scripts/create-github-release.mjs` package list. Those changes happen when the package starts publishing.
- Remote `$ref` resolution (schemas referencing external URIs). All fixtures use local `$ref` within `$defs`/`definitions`.
- Custom format assertion implementations. Format keywords are collected as metadata only.
- The `@hyperjump/browser` bundler caveat (Node-only entry point). Documented as a known constraint for future browser builds.

---

### Task 2: P3.2 Validation Orchestrator (PR #20)

**Goal / acceptance criteria:**

The runtime validates fields automatically based on the `validationTrigger` hint (`'blur'`, `'change'`, `'submit'`). Change-triggered validation is debounced (default 300ms, configurable). A monotonic epoch protects against stale async results: results from a validation that started before the most recent data change are silently dropped. Synchronous validation results (non-thenable `MaybePromise` return) apply immediately with no `'pending'` flicker. Submit-triggered validation (the existing path) continues to work.

**Packages touched:**
- Modify: `packages/core/src/runtime/runtime.ts`
- Modify: `packages/core/src/runtime/types.ts`
- Create: `packages/core/src/runtime/validation-scheduler.ts`
- Modify: `packages/core/src/commands/types.ts` (if new effects needed)
- Modify: `packages/core/src/runtime/__tests__/runtime.test.ts`
- Create: `packages/core/src/runtime/__tests__/validation-scheduler.test.ts`

**Public API changes:**

```typescript
// packages/core/src/runtime/types.ts — additions to FormRuntimeOptions
export interface FormRuntimeOptions {
  // ... existing fields ...
  validationDebounceMs?: number   // default 300
}
```

No new exports from `@texaryn/core`'s public API. `validationDebounceMs` is added to the existing `FormRuntimeOptions` interface.

**Architecture boundaries:**

- Validation scheduling lives in a `ValidationScheduler` class (or module) created by the runtime. It is not exported publicly.
- The scheduler is called from the effect executor, never from `processCommand`. Command handlers remain pure: they return intent (effects), the executor acts on them.
- The scheduler calls `port.validate(data)` (or `port.validateAt(data, pointer)` when available). It does not call `port.project()`.
- Debounce timers live inside the scheduler. The runtime passes `validationDebounceMs` at creation.
- The epoch counter is a private field on the scheduler, incremented by every data-mutating command (SetValue, InsertItem, RemoveItem, MoveItem, Reset).

**Implementation slices:**

- [ ] **Step 1: Write failing test for blur-triggered validation**

In `packages/core/src/runtime/__tests__/runtime.test.ts`, add:

```typescript
it('validates a field on blur when validationTrigger is blur', async () => {
  const validateFn = vi.fn(() => ({
    valid: false,
    errors: [{ instancePointer: '/name', keyword: 'minLength', message: 'too short', params: {} }],
  }))
  const port = makePort(() => simpleProjection, validateFn)
  const runtime = createFormRuntime(port, {
    initialData: { name: '' },
    hints: { '/name': { validationTrigger: 'blur' } },
  })
  const nameId = findFieldNode(runtime, '/name')

  runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'A' })
  // No validation yet (trigger is blur, not change)
  expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('idle')

  runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
  await vi.waitFor(() => {
    expect(runtime.getNodeState(nameId)!.errors.getSnapshot().length).toBeGreaterThan(0)
  })
  expect(validateFn).toHaveBeenCalled()
  runtime.destroy()
})
```

- [ ] **Step 2: Write failing test for change-triggered validation with debounce**

```typescript
it('validates a field on change after debounce', async () => {
  vi.useFakeTimers()
  const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
  const port = makePort(() => simpleProjection, validateFn)
  const runtime = createFormRuntime(port, {
    initialData: { name: '' },
    hints: { '/name': { validationTrigger: 'change' } },
    validationDebounceMs: 200,
  })
  const nameId = findFieldNode(runtime, '/name')

  runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'A' })
  runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'AB' })
  expect(validateFn).not.toHaveBeenCalled()

  vi.advanceTimersByTime(200)
  await vi.waitFor(() => {
    expect(validateFn).toHaveBeenCalledTimes(1)
  })
  vi.useRealTimers()
  runtime.destroy()
})
```

- [ ] **Step 3: Write failing test for stale result rejection (epoch model)**

```typescript
it('drops stale validation results after a newer data change', async () => {
  const resolvers: Array<(result: ValidationResult) => void> = []
  const validateFn = vi.fn(() => new Promise<ValidationResult>((resolve) => {
    resolvers.push(resolve)
  }))
  const port = makePort(() => simpleProjection, validateFn)
  const runtime = createFormRuntime(port, {
    initialData: { name: '' },
    hints: { '/name': { validationTrigger: 'change' } },
    validationDebounceMs: 0,
  })
  const nameId = findFieldNode(runtime, '/name')

  runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'A' })
  await vi.waitFor(() => expect(validateFn).toHaveBeenCalledTimes(1))
  expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('pending')

  // Data changes while first validation is in flight: epoch increments
  runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'AB' })

  // Resolve the FIRST (now stale, epoch 0) validation with errors
  resolvers[0]!({ valid: false, errors: [{ instancePointer: '/name', keyword: 'minLength', message: '', params: {} }] })
  await Promise.resolve()

  // Stale result should be dropped; errors stay empty
  expect(runtime.getNodeState(nameId)!.errors.getSnapshot()).toEqual([])
  runtime.destroy()
})
```

- [ ] **Step 4: Write failing test for sync validation (no pending flicker)**

```typescript
it('applies synchronous validation immediately without pending state', () => {
  const validateFn = vi.fn(() => ({
    valid: false,
    errors: [{ instancePointer: '/name', keyword: 'required', message: '', params: {} }],
  }))
  const port = makePort(() => simpleProjection, validateFn)
  const runtime = createFormRuntime(port, {
    initialData: { name: '' },
    hints: { '/name': { validationTrigger: 'change' } },
    validationDebounceMs: 0,
  })
  const nameId = findFieldNode(runtime, '/name')

  // Capture all status transitions
  const statuses: string[] = []
  runtime.getNodeState(nameId)!.validationStatus.subscribe(() => {
    statuses.push(runtime.getNodeState(nameId)!.validationStatus.getSnapshot())
  })

  runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: '' })
  // Sync result: should go directly to 'invalid', never through 'pending'
  expect(statuses).not.toContain('pending')
  expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('invalid')
  runtime.destroy()
})
```

- [ ] **Step 5: Implement ValidationScheduler**

`packages/core/src/runtime/validation-scheduler.ts`:

```typescript
import type { SchemaEvaluationPort, ValidationResult, NodeId, JsonPointer } from '../types.js'
import type { WritableStore } from '../state/store.js'
import type { ValidationError } from '../types.js'

interface SchedulerOptions {
  debounceMs: number
}

export class ValidationScheduler {
  private epoch = 0
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private destroyed = false

  constructor(
    private port: SchemaEvaluationPort,
    private options: SchedulerOptions,
  ) {}

  incrementEpoch(): void {
    this.epoch++
  }

  scheduleValidation(
    trigger: 'blur' | 'change' | 'submit',
    getData: () => unknown,
    callbacks: {
      onPending: () => void
      onResult: (result: ValidationResult, epoch: number) => void
    },
  ): void {
    if (this.destroyed) return
    const capturedEpoch = this.epoch

    if (trigger === 'change' && this.options.debounceMs > 0) {
      this.clearTimer('change')
      this.timers.set('change', setTimeout(() => {
        this.runValidation(getData(), capturedEpoch, callbacks)
      }, this.options.debounceMs))
    } else {
      this.runValidation(getData(), capturedEpoch, callbacks)
    }
  }

  private runValidation(
    data: unknown,
    capturedEpoch: number,
    callbacks: {
      onPending: () => void
      onResult: (result: ValidationResult, epoch: number) => void
    },
  ): void {
    const result = this.port.validate(data)
    if (result instanceof Promise || (result && typeof (result as any).then === 'function')) {
      callbacks.onPending()
      ;(result as Promise<ValidationResult>).then((resolved) => {
        if (!this.destroyed && capturedEpoch === this.epoch) {
          callbacks.onResult(resolved, capturedEpoch)
        }
      })
    } else {
      callbacks.onResult(result as ValidationResult, capturedEpoch)
    }
  }

  private clearTimer(key: string): void {
    const existing = this.timers.get(key)
    if (existing) {
      clearTimeout(existing)
      this.timers.delete(key)
    }
  }

  destroy(): void {
    this.destroyed = true
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }
}
```

- [ ] **Step 6: Wire the scheduler into the runtime's effect executor**

Modify `packages/core/src/runtime/runtime.ts`:

- Create `ValidationScheduler` in `createFormRuntime`.
- In the effect executor, when processing a `validate` effect:
  - For submit: use the existing synchronous path (validate all, block on result).
  - For blur/change: look up the node's `validationTrigger` hint, call `scheduler.scheduleValidation(trigger, getData, { onPending, onResult })`.
- Increment `scheduler.epoch` on every data-mutating command (SetValue, InsertItem, RemoveItem, MoveItem, Reset).
- When applying results: check `capturedEpoch === scheduler.epoch`. If stale, drop. If current, distribute errors to node stores as the existing submit path does.
- For synchronous results (non-thenable), apply immediately within the same microtask. The `onResult` callback sets validationStatus directly to 'valid' or 'invalid', never transitioning through 'pending'.
- For async results, the scheduler calls `onPending` before awaiting, so the runtime sets 'pending' on affected nodes when async validation starts.
- Pass `validationDebounceMs` from options (default 300).
- `FormRuntimeOptions` already has `hints?: UIHints` (pointer-keyed, with `validationTrigger` on `FieldHints`). The scheduler reads `validationTrigger` from the hints for each node's data pointer.

- [ ] **Step 7: Run tests, iterate until all pass**

Run: `pnpm --filter @texaryn/core test`
Expected: All new and existing tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/runtime/
git commit -m "feat: add validation orchestrator with blur/change/submit triggers

Introduces ValidationScheduler with monotonic epoch for stale-result
protection, configurable debounce (default 300ms), and immediate
application of synchronous validation results (no pending flicker).
Scheduling lives in the effect executor, keeping command handlers pure."
```

**Tests / conformance cases:**

- Blur trigger: validate fires on SetTouched, not on SetValue
- Change trigger with debounce: validate fires once after debounce, not per keystroke
- Stale result rejection: results from a validation that started before the latest data change are dropped
- Sync validation: no 'pending' state for synchronous port.validate() returns
- Submit trigger: existing submit flow continues to work (regression)
- Default debounce: 300ms when not configured
- Custom debounce: respects `validationDebounceMs` option
- Destroy: pending timers and in-flight validations do not apply after runtime.destroy()
- Epoch increment: every data-mutating command increments the epoch

**Changeset impact:**

Minor changeset for `@texaryn/core` (new feature: validation orchestration). Fixed group bumps all three packages.

**Dependencies on previous P3 work:**

None. Existing runtime infrastructure is sufficient.

**Explicit non-goals:**
- Per-field validation via `validateAt()`. The orchestrator calls `validate(data)` (full-form validation) and distributes results. Field-level validation is a future optimization.
- Custom validation functions (user-supplied validators outside the schema). Out of scope for the port contract.
- Network-aware debounce (adapting debounce time to validation latency). Static debounce is sufficient for 0.1.0.
- Cross-field validation dependencies (field A's validity depending on field B's value). Handled implicitly by full-form validation; explicit dependency tracking is not needed.

---

### Task 3: P3.3 Accessible Error Presentation (PR #21)

**Goal / acceptance criteria:**

Core defines an error display policy: a field's errors are shown when the field is both `touched` and `invalid`. React's prop getters wire ARIA attributes (`aria-invalid`, `aria-describedby`) based on this policy. The conformance suite from PR #14 is extended with ARIA assertions. An `ErrorSummary` component (using the existing `textRole: 'error-summary'` IR node type) collects all visible errors for screen reader announcement.

**Packages touched:**
- Modify: `packages/core/src/runtime/runtime.ts` (add `showErrors` computed per node)
- Modify: `packages/core/src/runtime/types.ts` (add `showErrors` to `NodeState`)
- Modify: `packages/react/src/props/field-props.ts` (wire ARIA from showErrors)
- Modify: `packages/react/src/hooks/use-field.ts` (expose showErrors)
- Create: `packages/react/src/components/ErrorSummary.tsx`
- Modify: `tests/conformance/` (extend PR #14 conformance with ARIA assertions)

**Public API changes:**

```typescript
// packages/core/src/runtime/types.ts — addition to NodeState
export interface NodeState {
  // ... existing stores ...
  readonly showErrors: Store<boolean>   // touched && invalid
}

// packages/react/src/hooks/use-field.ts — addition to UseFieldReturn
export interface UseFieldReturn {
  // ... existing fields ...
  showErrors: boolean
}

// packages/react/src/index.ts — new export
export { ErrorSummary } from './components/ErrorSummary.js'
```

**Architecture boundaries:**

- Core owns the display policy (`showErrors = touched && status === 'invalid'`). React reads it; React does not compute it.
- Prop getters set `aria-invalid` only when `showErrors` is true. Before the field is touched, `aria-invalid` is absent (not `false`), following WAI-ARIA best practices.
- `aria-describedby` points to the error container's ID only when `showErrors` is true and errors exist.
- `ErrorSummary` is a React component that reads the runtime's node states and collects errors where `showErrors` is true. It renders with `role="alert"` and `aria-live="polite"`.
- The error ID pattern follows the existing convention: `texaryn-${nodeId}-errors`.

**Implementation slices:**

- [ ] **Step 1: Write failing test for showErrors store**

```typescript
it('showErrors is false until field is touched and invalid', async () => {
  const port = makePort(
    () => simpleProjection,
    () => ({ valid: false, errors: [{ instancePointer: '/name', keyword: 'required', message: '', params: {} }] }),
  )
  const runtime = createFormRuntime(port, {
    initialData: { name: '' },
    hints: { '/name': { validationTrigger: 'blur' } },
  })
  const nameId = findFieldNode(runtime, '/name')
  expect(runtime.getNodeState(nameId)!.showErrors.getSnapshot()).toBe(false)

  runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
  await vi.waitFor(() => {
    expect(runtime.getNodeState(nameId)!.showErrors.getSnapshot()).toBe(true)
  })
  runtime.destroy()
})
```

- [ ] **Step 2: Add showErrors store to NodeState in runtime**

In `packages/core/src/runtime/runtime.ts`, when creating `NodeStoreBundle`, add a computed store:

```typescript
const showErrors = createStore(false)

// Update showErrors whenever touched or validationStatus changes
function updateShowErrors() {
  const isTouched = touchedStore.getSnapshot()
  const status = validationStatusStore.getSnapshot()
  showErrors.set(isTouched && status === 'invalid')
}
```

Subscribe `updateShowErrors` to both `touchedStore` and `validationStatusStore`.

- [ ] **Step 3: Update NodeState type**

Add `readonly showErrors: Store<boolean>` to the `NodeState` interface in `packages/core/src/runtime/types.ts`.

- [ ] **Step 4: Wire ARIA in prop getters**

Modify `packages/react/src/props/field-props.ts`:

```typescript
export function getInputProps(node: UINode, fieldState: UseFieldReturn) {
  const base = {
    id: `texaryn-${node.id}`,
    name: node.dataPointer,
    value: fieldState.value,
    disabled: fieldState.disabled,
    'aria-required': node.constraints?.required || undefined,
    onChange: fieldState.onChange,
    onBlur: fieldState.onBlur,
  }

  if (fieldState.showErrors) {
    return {
      ...base,
      'aria-invalid': true,
      'aria-describedby': `texaryn-${node.id}-errors`,
    }
  }

  return base
}
```

- [ ] **Step 5: Expose showErrors in useField hook**

Modify `packages/react/src/hooks/use-field.ts` to subscribe to the `showErrors` store and include it in `UseFieldReturn`.

- [ ] **Step 6: Implement ErrorSummary component**

`packages/react/src/components/ErrorSummary.tsx`:

```typescript
import { useSyncExternalStore } from 'react'
import { useFormContext } from '../context/form-context.js'
import type { NodeId, ValidationError } from '@texaryn/core'

interface VisibleError {
  nodeId: NodeId
  errors: ValidationError[]
}

export function ErrorSummary() {
  const { runtime } = useFormContext()
  const doc = useSyncExternalStore(
    runtime.document.subscribe,
    runtime.document.getSnapshot,
  )

  const visibleErrors: VisibleError[] = []
  for (const nodeId of Object.keys(doc.nodes) as NodeId[]) {
    const state = runtime.getNodeState(nodeId)
    if (!state) continue
    const show = state.showErrors.getSnapshot()
    if (!show) continue
    const errors = state.errors.getSnapshot()
    if (errors.length > 0) {
      visibleErrors.push({ nodeId, errors })
    }
  }

  if (visibleErrors.length === 0) return null

  return (
    <div role="alert" aria-live="polite">
      <ul>
        {visibleErrors.flatMap(({ nodeId, errors }) =>
          errors.map((err, i) => (
            <li key={`${nodeId}-${i}`}>{err.message ?? err.keyword}</li>
          )),
        )}
      </ul>
    </div>
  )
}
```

Note: `useFormContext` is the existing context hook from `packages/react/src/context/`. The component subscribes to the document store to re-render when nodes change, then reads each node's `showErrors` and `errors` stores. Only errors from `showErrors === true` nodes appear.

- [ ] **Step 7: Extend conformance suite with ARIA assertions**

In `tests/conformance/`, add cases that verify:
- `aria-invalid` is absent on untouched fields
- `aria-invalid` is `true` on touched, invalid fields
- `aria-describedby` points to the error element ID when errors are shown
- Error elements have `role="alert"` and `aria-live="polite"`
- ErrorSummary collects only errors from nodes where showErrors is true

- [ ] **Step 8: Run full test suite**

Run: `pnpm test`
Expected: All tests pass, including new ARIA conformance cases.

- [ ] **Step 9: Commit**

```bash
git add packages/core/ packages/react/ tests/conformance/
git commit -m "feat: add accessible error presentation with showErrors policy

Core computes showErrors (touched && invalid) per node. React prop
getters wire aria-invalid and aria-describedby only when errors should
display. ErrorSummary component collects visible errors for screen
reader announcement."
```

**Tests / conformance cases:**

- showErrors is false on untouched field
- showErrors is false on touched but valid field
- showErrors is true on touched and invalid field
- showErrors transitions to false when errors clear
- aria-invalid absent when showErrors is false
- aria-invalid true when showErrors is true
- aria-describedby set only when showErrors is true and errors exist
- Error element has role="alert" and aria-live="polite"
- ErrorSummary renders only errors from showErrors=true nodes
- ErrorSummary is empty when no errors are visible

**Changeset impact:**

Minor changeset for `@texaryn/core` (new showErrors store) and `@texaryn/react` (ErrorSummary export, prop getter updates). Fixed group bumps all three.

**Dependencies on previous P3 work:**

- P3.2 (validation orchestrator): showErrors depends on validationStatus being set by the scheduler. Without P3.2, validation only happens on submit.

**Explicit non-goals:**
- Custom error display policies (e.g. show errors immediately, show on change). The `touched && invalid` policy is the single rule for 0.1.0. Customization is a future feature.
- Error message formatting or localization. Errors are passed through as-is from the adapter.
- Inline error positioning (placing error text near the field in the DOM). The prop getters link field to error via `aria-describedby`; physical positioning is the consumer's layout concern.

---

### Task 4: P3.4 Submission Lifecycle (PR #22)

**Goal / acceptance criteria:**

The submission state machine is documented as an explicit transition table. Guards prevent invalid transitions (Submit while already submitting is a no-op). The `SubmissionState` gains a `'failed'` convenience (still `status: 'idle'` with `error` set, but the runtime explicitly resets validation state and re-enables the submit button). Data edits during `'submitting'` are accepted (they update stores normally) but do not trigger re-validation until submission completes or fails. The `Reset` command during submission cancels the in-flight submit.

**Packages touched:**
- Modify: `packages/core/src/runtime/runtime.ts`
- Modify: `packages/core/src/runtime/__tests__/runtime.test.ts`
- Modify: `packages/core/src/ir/runtime-state.ts` (document the state machine)

**Public API changes:**

No type changes. `SubmissionState` keeps its existing shape:
```typescript
export interface SubmissionState {
  status: 'idle' | 'validating' | 'submitting' | 'submitted'
  error?: unknown
}
```

The `'failed'` state is represented as `{ status: 'idle', error: <the error> }`. Adding a `'failed'` union member would be a breaking change to consumers switching on `status`. The `error` field being defined while `status` is `'idle'` is the signal that the previous submission failed.

The transition table (documented in source):

| Current state | Event | Guard | Next state | Side effects |
|---|---|---|---|---|
| idle | Submit | no pending submit | validating | Run full-form validation |
| idle | Submit | error is set (prior failure) | validating | Clear error, run validation |
| validating | validation succeeds | | submitting | Call onSubmit |
| validating | validation fails | | idle | Distribute errors to nodes |
| submitting | onSubmit resolves | | submitted | |
| submitting | onSubmit rejects | | idle + error | |
| submitting | SetValue/Insert/Remove/Move | | submitting (data updates) | Stores update, no re-validation |
| submitting | Reset | | idle | Cancel in-flight, reset data |
| submitted | Submit | | validating | Re-run validation |
| submitted | Reset | | idle | Reset data |
| validating | Submit | | no-op | |
| submitting | Submit | | no-op | |

**Architecture boundaries:**

- The state machine lives in the runtime's command handler for Submit and in the effect executor for transitions after validation/submission.
- `processCommand` for Submit returns no effects when the guard prevents the transition (submitting or validating).
- Data-mutating commands during `submitting` work normally (update stores, increment epoch) but do not schedule validation.
- The scheduler's `destroy()` is called on runtime destroy, not on submission failure.

**Implementation slices:**

- [ ] **Step 1: Write failing test for Submit-while-submitting guard**

```typescript
it('ignores Submit while already submitting', async () => {
  let resolveSubmit: () => void
  const onSubmit = vi.fn(() => new Promise<void>((resolve) => { resolveSubmit = resolve }))
  const port = makePort(() => simpleProjection, () => ({ valid: true, errors: [] }))
  const runtime = createFormRuntime(port, { initialData: { name: 'Alice' }, onSubmit })

  runtime.dispatch({ type: 'Submit' })
  await vi.waitFor(() => {
    expect(runtime.submission.getSnapshot().status).toBe('submitting')
  })

  runtime.dispatch({ type: 'Submit' })
  // onSubmit should have been called exactly once
  expect(onSubmit).toHaveBeenCalledTimes(1)

  resolveSubmit!()
  await vi.waitFor(() => {
    expect(runtime.submission.getSnapshot().status).toBe('submitted')
  })
  runtime.destroy()
})
```

- [ ] **Step 2: Write failing test for submission failure (idle + error)**

```typescript
it('returns to idle with error when onSubmit rejects', async () => {
  const submitError = new Error('Network error')
  const onSubmit = vi.fn(() => Promise.reject(submitError))
  const port = makePort(() => simpleProjection, () => ({ valid: true, errors: [] }))
  const runtime = createFormRuntime(port, { initialData: { name: 'Alice' }, onSubmit })

  runtime.dispatch({ type: 'Submit' })
  await vi.waitFor(() => {
    const sub = runtime.submission.getSnapshot()
    expect(sub.status).toBe('idle')
    expect(sub.error).toBe(submitError)
  })
  runtime.destroy()
})
```

- [ ] **Step 3: Write failing test for data edits during submitting**

```typescript
it('accepts data edits during submitting without triggering validation', async () => {
  let resolveSubmit: () => void
  const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
  const port = makePort(() => simpleProjection, validateFn)
  const runtime = createFormRuntime(port, {
    initialData: { name: 'Alice' },
    onSubmit: () => new Promise<void>((resolve) => { resolveSubmit = resolve }),
    hints: { '/name': { validationTrigger: 'change' } },
    validationDebounceMs: 0,
  })

  runtime.dispatch({ type: 'Submit' })
  await vi.waitFor(() => {
    expect(runtime.submission.getSnapshot().status).toBe('submitting')
  })

  const callsBefore = validateFn.mock.calls.length
  const nameId = findFieldNode(runtime, '/name')
  runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })

  // Data updates
  expect((runtime.data.getSnapshot() as any).name).toBe('Bob')
  // But validation does not re-trigger during submission
  expect(validateFn.mock.calls.length).toBe(callsBefore)

  resolveSubmit!()
  runtime.destroy()
})
```

- [ ] **Step 4: Write failing test for Reset during submitting**

```typescript
it('Reset during submitting cancels submission and resets data', async () => {
  let resolveSubmit: () => void
  const onSubmit = vi.fn(() => new Promise<void>((resolve) => { resolveSubmit = resolve }))
  const port = makePort(() => simpleProjection, () => ({ valid: true, errors: [] }))
  const runtime = createFormRuntime(port, { initialData: { name: 'Alice' }, onSubmit })

  runtime.dispatch({ type: 'Submit' })
  await vi.waitFor(() => {
    expect(runtime.submission.getSnapshot().status).toBe('submitting')
  })

  runtime.dispatch({ type: 'Reset' })
  expect(runtime.submission.getSnapshot().status).toBe('idle')
  expect(runtime.submission.getSnapshot().error).toBeUndefined()
  runtime.destroy()
})
```

- [ ] **Step 5: Implement transition guards in processCommand**

Modify `packages/core/src/runtime/runtime.ts`:

- Submit command: check `submission.status`. If `'validating'` or `'submitting'`, return no effects (no-op).
- Clear `error` when transitioning from idle-with-error to validating.
- Data-mutating commands during `'submitting'`: update stores, increment scheduler epoch, but do not emit `validate` effects.
- Reset during `'submitting'`: set submission to `{ status: 'idle' }`, reset data, abort the pending onSubmit result (set a cancelled flag).

- [ ] **Step 6: Document the transition table in source**

Add the transition table as a code comment at the top of the submission handling section in `runtime.ts` (this qualifies as a "why" comment: the state machine's contract is not obvious from reading individual transitions).

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @texaryn/core test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/
git commit -m "feat: harden submission lifecycle with transition guards

Submit-while-submitting is a no-op. Failed submissions return to idle
with error set. Data edits during submitting update stores but do not
trigger re-validation. Reset during submitting cancels the in-flight
submit."
```

**Tests / conformance cases:**

- Submit while idle: transitions to validating (existing, regression)
- Submit while validating: no-op
- Submit while submitting: no-op
- Submit while submitted: transitions to validating (re-submit)
- Validation failure: transitions to idle, distributes errors (existing, regression)
- Validation success: transitions to submitting, calls onSubmit (existing, regression)
- onSubmit resolves: transitions to submitted (existing, regression)
- onSubmit rejects: transitions to idle with error
- Data edit during submitting: stores update, no validation
- Reset during submitting: cancels submit, returns to idle
- Reset during idle-with-error: clears error
- Re-submit after failure: clears error, runs validation

**Changeset impact:**

Patch changeset for `@texaryn/core` (behavioral fix: guard against double submit). Fixed group bumps all three packages.

**Dependencies on previous P3 work:**

- P3.2 (validation orchestrator): the scheduler's epoch is incremented by data edits during submission, but validation is suppressed. The "suppress validation during submitting" logic depends on the scheduler existing.

**Explicit non-goals:**
- Retry logic for failed submissions. The consumer's `onSubmit` handles retries.
- Optimistic submission (proceed before validation). Validation always runs first.
- Partial submission (submitting a subset of fields). Always full-form.
- A `'failed'` status enum member. Failure is `{ status: 'idle', error: <defined> }`.

---

### Task 5: P3.5 Documentation and Stable Release Readiness (PR #23)

**Goal / acceptance criteria:**

API reference documentation is generated from source types using typedoc. A `docs/` output is gitignored but the generation command is documented. The changeset graduation path from alpha to 0.1.0 stable is verified with a dry-run. `npm dist-tag ls` confirms 0.1.0 would land on `latest` and the alpha tag is documented as needing manual cleanup. The demo app is updated to exercise P3.2-P3.4 features (live validation, error display, submission states).

**Packages touched:**
- Modify: `packages/demo/` (update demo to show validation, errors, submission)
- Create: `typedoc.json` (typedoc configuration)
- Modify: root `package.json` (add `docs` script)
- Modify: `.gitignore` (ignore `docs/api/` output)

**Public API changes:**

None.

**Architecture boundaries:**

- typedoc reads the three published packages' source types. It does not read the demo or conformance tests.
- The demo exercises the public API only. It does not import internal modules.
- The changeset graduation is a verification step, not an implementation step. No version bumps happen in this PR.

**Implementation slices:**

- [ ] **Step 1: Add typedoc configuration**

`typedoc.json`:
```json
{
  "entryPoints": [
    "packages/core/src/index.ts",
    "packages/schema-json/src/index.ts",
    "packages/react/src/index.ts"
  ],
  "out": "docs/api",
  "plugin": ["typedoc-plugin-markdown"],
  "tsconfig": "tsconfig.json",
  "excludePrivate": true,
  "excludeInternal": true
}
```

Root `package.json` addition:
```json
{
  "scripts": {
    "docs": "typedoc"
  }
}
```

- [ ] **Step 2: Add docs/api/ to .gitignore**

Append `docs/api/` to `.gitignore`.

- [ ] **Step 3: Install typedoc**

```bash
pnpm add -Dw typedoc typedoc-plugin-markdown
```

- [ ] **Step 4: Generate docs and verify**

Run: `pnpm docs`
Expected: `docs/api/` is populated with markdown files for all public types and functions.

- [ ] **Step 5: Update demo app to show P3 features**

Modify the demo to include:
- A form with `validationTrigger: 'blur'` on some fields and `'change'` on others
- Visible error messages that appear only after touching a field
- A submit button that shows loading state during submission
- A display of submission error when onSubmit fails

This demonstrates the full P3 feature set: live validation (P3.2), error display (P3.3), and submission lifecycle (P3.4).

- [ ] **Step 6: Verify changeset graduation path (dry-run)**

Run the following locally to verify the alpha-to-stable graduation works:

```bash
# Check current dist-tag state before the exercise
npm dist-tag ls @texaryn/core

# If the repo is in changesets pre mode, exit pre first
if [ -f .changeset/pre.json ]; then
  pnpm changeset pre exit
fi

# Create a test changeset
pnpm changeset
# Select all three published packages, minor bump, message "chore: test graduation"

# Run changeset version (config already has commit: false)
pnpm changeset version

# Verify versions in package.json files
node -e "
  const pkgs = ['core', 'schema-json', 'react'];
  for (const p of pkgs) {
    const {version} = require('./packages/' + p + '/package.json');
    console.log('@texaryn/' + p + ':', version);
  }
"
# Expected: all three show 0.1.0 (not 0.1.0-alpha.1)
# If 0.1.0-alpha.1 appears, pre mode was not exited

# Clean up (only restore changeset-affected files, not the entire tree)
git restore .changeset packages/*/package.json packages/*/CHANGELOG.md
```

Document that after the 0.1.0 publish, the alpha dist-tag needs manual cleanup:
```bash
npm dist-tag ls @texaryn/core          # verify 'latest' points to 0.1.0
npm dist-tag rm @texaryn/core alpha
npm dist-tag rm @texaryn/schema-json alpha
npm dist-tag rm @texaryn/react alpha
```

(This is a manual step because `changesets publish` does not remove old dist-tags.)

- [ ] **Step 7: Run full test suite and build**

Run: `pnpm build && pnpm test`
Expected: Clean build, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add typedoc.json .gitignore package.json packages/demo/
git commit -m "docs: add typedoc configuration and update demo for P3 features

Adds typedoc with markdown plugin for API reference generation.
Updates demo to exercise live validation, error display, and
submission lifecycle. Documents changeset graduation path to 0.1.0."
```

**Tests / conformance cases:**

No new test cases. The demo is manually verified by running `pnpm start` and interacting with the form. The typedoc output is verified by running `pnpm docs` and inspecting `docs/api/`.

**Changeset impact:**

No changeset. This PR changes only the demo (ignored by changesets), adds documentation tooling, and adds gitignore entries. No published package code changes.

**Dependencies on previous P3 work:**

- P3.2, P3.3, P3.4: the demo update exercises features from all three prior PRs.

**Explicit non-goals:**
- Publishing 0.1.0 stable. The version bump PR follows this one (PR #24, "Version Packages").
- Hosting the generated docs (GitHub Pages, Vercel, etc.). Generation is local for now.
- A changelog rewrite or release notes draft. The changelog is auto-generated by changesets from commit messages.
- Publishing `@texaryn/schema-json-hyperjump`. It stays private with placeholder-publish steps documented for when it graduates.
- Cleaning up the alpha dist-tag. Documented as a post-publish manual step.

---

## PR Sequence

| PR | Task | Branch | Changeset |
|---|---|---|---|
| #19 | P3.1 Second adapter + conformance suite | `feat/p3.1-hyperjump-adapter` | None (new package is private) |
| #20 | P3.2 Validation orchestrator | `feat/p3.2-validation-orchestrator` | Minor (@texaryn/core) |
| #21 | P3.3 Accessible error presentation | `feat/p3.3-error-presentation` | Minor (@texaryn/core, @texaryn/react) |
| #22 | P3.4 Submission lifecycle | `feat/p3.4-submission-lifecycle` | Patch (@texaryn/core) |
| #23 | P3.5 Documentation + stable readiness | `docs/p3.5-stable-readiness` | None |
| #24 | Version Packages (0.1.0) | `changeset-release/main` | Automated by changesets action |

Each PR merges to `main` in order. PRs #20-#22 each carry a changeset that, combined, produce the 0.1.0 bump when `changeset version` runs.
