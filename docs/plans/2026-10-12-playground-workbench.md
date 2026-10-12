# Playground Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the playground into a workbench: a CodeMirror schema editor checked by Texaryn's own schema library beside the live form, an inspector docked underneath, panes that resize, collapse and maximize, a phone layout with one view at a time, preview width presets, data presets and a command palette.

**Architecture:** Five pull requests, each from `main`. PR 0 makes schema edits keep the form data (#232). PR 1 lifts the `FormRuntime` above a `react-resizable-panels` layout so layout operations never remount the editor or the form. PR 2 adds a lazily loaded CodeMirror editor whose schema diagnostics come from a new `checkSchema` export of `@texaryn/schema-json`. PR 3 adds data presets to the `@texaryn/examples` contract and the preview header. PR 4 adds a `cmdk` command palette.

**Tech Stack:** React 19, Vite 6, Vitest 3.2 (jsdom and Playwright Chromium browser mode), `react-resizable-panels` 4.14.4, CodeMirror 6 (`@codemirror/*`, `@lezer/json`), `cmdk` 1.1.1, `@texaryn/json-schema-library` 11.6.6 through `@texaryn/schema-json`.

**Spec:** `docs/plans/2026-10-12-playground-workbench-design.md` ([#242](https://github.com/texaryn/texaryn/pull/242)). Read it before any task.

## Global Constraints

- One pull request per numbered PR below, each on a fresh branch from `main`: `fix/playground-schema-edit-lifecycle`, `feat/playground-workbench-shell`, `feat/playground-code-editor`, `feat/playground-presets`, `feat/playground-command-palette`.
- Conventional commit subjects. No `Co-Authored-By` or agent attribution in commits, branches or pull requests. SSH remotes.
- No dash punctuation in prose, comments, commit messages or pull request descriptions. Hyphens in compound words stay.
- Code comments only for invariants, external contracts or intentional limits. No comments that restate the code.
- Exact pins: `react-resizable-panels@4.14.4`, `cmdk@1.1.1`. Install CodeMirror packages with `pnpm add -E` so the lockfile pins what resolves.
- Layout numbers: phone layout below 800px (`(max-width: 799px)`); schema 46% and preview 54% of the top row; top row 72% and inspector 28%; minimums schema 280px, preview 320px, inspector 120px; pinned example list 216px; example overlay 260px.
- Panel size strings: a bare number string is a percentage and a number is pixels in `react-resizable-panels` 4, so write `defaultSize="46"` and `minSize={280}`.
- Timing: schema rebuild debounce 300ms; editor lint delay 300ms.
- Storage keys: layout state under `texaryn-playground-layout` (version 1); panel sizes under the prefix `texaryn-playground-panels:`. Every storage read and write sits in a `try` block, as `theme.ts` does.
- Preview widths: Phone 375px, Tablet 768px, Fit.
- Size limits enforced by `scripts/check-playground-size.mjs`: first-load scripts at most 320 KB gzipped, the `editor` chunk at most 150 KB, the `palette` chunk at most 25 KB.
- Changesets: only `@texaryn/schema-json` changes publish (minor, PR 2). `@texaryn/playground` and `@texaryn/examples` are in the changeset `ignore` list.
- After changing `@texaryn/schema-json` exports, run `pnpm docs` and commit `docs/api`, or `pnpm docs:check` fails.
- UI copy is sentence case.
- Before each pull request: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm site:build`. Pages deploys only from `main`, so after each merge check the change on https://texaryn.github.io/texaryn/playground/.

## Review Focus

- **Property names containing `/` or `~`.** `json-schema-library` reports `#/properties/a/b/minLength` for a property named `a/b`. `checkSchema` must return `/properties/a~1b/minLength` and the editor must underline the `minLength` value inside `"a/b"`. Pinned in Task 10 and Task 11.
- **A schema whose adapter preparation throws**, for example a `$ref` that applies itself at the same location (`SameLocationCycleError`). The editor shows one diagnostic at the start of the document instead of crashing, and the preview keeps the last valid form with the error shown. Pinned in Task 2 and Task 13.
- **A stored layout from another version, or corrupt JSON in storage.** The workbench loads with the default layout. Pinned in Task 3.
- **Switching renderer while a debounced schema rebuild is pending.** Data typed before the switch survives the switch and the rebuild. Pinned in Task 2.
- **Applying a data preset while the schema text is invalid.** The preset applies to the form on screen, which is the last valid one. Pinned in Task 16.

---

## PR 0: Schema edits keep the form data

Branch `fix/playground-schema-edit-lifecycle`. Closes [#232](https://github.com/texaryn/texaryn/issues/232).

Today every valid keystroke builds a new adapter, `FormWorkspace` is keyed by the adapter generation so it remounts, and the first edit switches the selection to `custom`, which drops the example's `initialData` and hints. One invalid character replaces the form and the inspector with `NotReady`.

### Task 1: Debounced, last-valid schema

**Files:**
- Create: `apps/playground/src/schema-draft.ts`
- Create: `apps/playground/src/use-applied-schema.ts`
- Test: `apps/playground/src/__tests__/use-applied-schema.test.tsx`

**Interfaces:**
- Produces: `readSchemaDraft(text: string): SchemaDraft`, `type SchemaDraft = { kind: 'valid'; parsed: unknown; canonical: string } | { kind: 'invalid'; error: string }`
- Produces: `useAppliedSchema(text: string, revision: number, delayMs?: number): AppliedSchemaState`, `interface AppliedSchema { parsed: unknown; canonical: string }`, `interface AppliedSchemaState { applied: AppliedSchema | null; parseError: string | null; pending: boolean }`, `SCHEMA_APPLY_DELAY_MS = 300`

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { readSchemaDraft } from '../schema-draft.js'
import { useAppliedSchema } from '../use-applied-schema.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('readSchemaDraft', () => {
  it('canonicalises whitespace so formatting changes compare equal', () => {
    const a = readSchemaDraft('{"type":"object"}')
    const b = readSchemaDraft('{\n  "type": "object"\n}')
    expect(a).toMatchObject({ kind: 'valid' })
    expect(b).toMatchObject({ kind: 'valid' })
    if (a.kind === 'valid' && b.kind === 'valid') expect(a.canonical).toBe(b.canonical)
  })

  it('reports the parse error for invalid text', () => {
    expect(readSchemaDraft('{"type":')).toMatchObject({ kind: 'invalid' })
  })
})

describe('useAppliedSchema', () => {
  it('applies the first valid text immediately', () => {
    const { result } = renderHook(() => useAppliedSchema('{"type":"object"}', 0))
    expect(result.current.applied?.parsed).toEqual({ type: 'object' })
    expect(result.current.pending).toBe(false)
  })

  it('debounces later edits by the delay', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ text }) => useAppliedSchema(text, 0, 300), {
      initialProps: { text: '{"type":"object"}' },
    })
    rerender({ text: '{"type":"object","title":"A"}' })
    expect(result.current.pending).toBe(true)
    expect(result.current.applied?.parsed).toEqual({ type: 'object' })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.applied?.parsed).toEqual({ type: 'object', title: 'A' })
    expect(result.current.pending).toBe(false)
  })

  it('keeps the same applied object for a whitespace-only edit', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ text }) => useAppliedSchema(text, 0, 300), {
      initialProps: { text: '{"type":"object"}' },
    })
    const before = result.current.applied
    rerender({ text: '{ "type": "object" }' })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.applied).toBe(before)
  })

  it('keeps the last applied schema and reports the error while text is invalid', () => {
    const { result, rerender } = renderHook(({ text }) => useAppliedSchema(text, 0), {
      initialProps: { text: '{"type":"object"}' },
    })
    rerender({ text: '{"type":' })
    expect(result.current.applied?.parsed).toEqual({ type: 'object' })
    expect(result.current.parseError).not.toBeNull()
  })

  it('applies at once when the revision changes', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ text, revision }) => useAppliedSchema(text, revision, 300), {
      initialProps: { text: '{"type":"object"}', revision: 0 },
    })
    rerender({ text: '{"type":"array"}', revision: 1 })
    expect(result.current.applied?.parsed).toEqual({ type: 'array' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/use-applied-schema.test.tsx`
Expected: FAIL, cannot resolve `../schema-draft.js`.

- [ ] **Step 3: Implement**

`apps/playground/src/schema-draft.ts`:

```ts
export type SchemaDraft =
  | { kind: 'valid'; parsed: unknown; canonical: string }
  | { kind: 'invalid'; error: string }

export function readSchemaDraft(text: string): SchemaDraft {
  try {
    const parsed: unknown = JSON.parse(text)
    return { kind: 'valid', parsed, canonical: JSON.stringify(parsed) }
  } catch (error) {
    return { kind: 'invalid', error: error instanceof Error ? error.message : String(error) }
  }
}
```

`apps/playground/src/use-applied-schema.ts`:

```ts
import { useEffect, useRef, useState } from 'react'
import { readSchemaDraft } from './schema-draft.js'

export const SCHEMA_APPLY_DELAY_MS = 300

export interface AppliedSchema {
  parsed: unknown
  canonical: string
}

export interface AppliedSchemaState {
  applied: AppliedSchema | null
  parseError: string | null
  pending: boolean
}

// `revision` changes when the text is replaced wholesale, such as selecting an
// example; those apply at once. Typing keeps the revision and is debounced.
export function useAppliedSchema(
  text: string,
  revision: number,
  delayMs: number = SCHEMA_APPLY_DELAY_MS,
): AppliedSchemaState {
  const draft = readSchemaDraft(text)
  const [applied, setApplied] = useState<AppliedSchema | null>(() =>
    draft.kind === 'valid' ? { parsed: draft.parsed, canonical: draft.canonical } : null,
  )
  const appliedRevision = useRef(revision)
  const canonical = draft.kind === 'valid' ? draft.canonical : null

  useEffect(() => {
    if (draft.kind !== 'valid') return
    const next = { parsed: draft.parsed, canonical: draft.canonical }
    if (revision !== appliedRevision.current) {
      appliedRevision.current = revision
      setApplied(next)
      return
    }
    if (applied?.canonical === draft.canonical) return
    const timer = setTimeout(() => setApplied(next), delayMs)
    return () => clearTimeout(timer)
    // `canonical` stands in for `draft`, which is rebuilt every render.
  }, [canonical, revision, delayMs])

  return {
    applied,
    parseError: draft.kind === 'invalid' ? draft.error : null,
    pending: draft.kind === 'valid' && applied?.canonical !== draft.canonical,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run --project playground src/__tests__/use-applied-schema.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/playground/src/schema-draft.ts apps/playground/src/use-applied-schema.ts apps/playground/src/__tests__/use-applied-schema.test.tsx
git commit -m "fix(playground): debounce schema edits and keep the last valid schema"
```

### Task 2: Keep the form through edits, invalid JSON and adapter errors

**Files:**
- Modify: `apps/playground/src/App.tsx` (`useAdapter`, `NotReady`, `FormWorkspace`, `App`)
- Modify: `apps/playground/src/playground.css` (add `.pg-stale`)
- Test: `apps/playground/src/__tests__/schema-edit-lifecycle.test.tsx`

**Interfaces:**
- Consumes: `useAppliedSchema`, `AppliedSchema` from Task 1.
- Produces: `useAdapter(applied: AppliedSchema | null): AdapterState` where `type AdapterState = { ready: { port: SchemaEvaluationPort; id: number } | null; loading: boolean; error: string | null }`. `ready` keeps the last successful adapter while a newer one is loading or has failed.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { App } from '../App.js'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', import.meta.env.BASE_URL)
})

function schemaEditor(): HTMLTextAreaElement {
  return screen.getByLabelText(/^JSON Schema/) as HTMLTextAreaElement
}

function editSchema(update: (schema: Record<string, unknown>) => void): void {
  const schema = JSON.parse(schemaEditor().value) as Record<string, unknown>
  update(schema)
  fireEvent.change(schemaEditor(), { target: { value: JSON.stringify(schema, null, 2) } })
}

async function openStringField(): Promise<HTMLInputElement> {
  fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
  const name = (await screen.findByLabelText('Name')) as HTMLInputElement
  fireEvent.change(name, { target: { value: 'Ada' } })
  return name
}

describe('editing the schema', () => {
  it('keeps typed data when the schema gains a field', async () => {
    render(<App />)
    await openStringField()
    editSchema((schema) => {
      ;(schema.properties as Record<string, unknown>).nickname = { type: 'string', title: 'Nickname' }
    })
    await screen.findByLabelText('Nickname')
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ada')
  })

  it('does not rebuild the form for a whitespace-only edit', async () => {
    render(<App />)
    const before = await openStringField()
    fireEvent.change(schemaEditor(), { target: { value: `${schemaEditor().value}\n\n` } })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(screen.getByLabelText('Name')).toBe(before)
    expect(before.value).toBe('Ada')
  })

  it('keeps the last valid form while the JSON is invalid', async () => {
    render(<App />)
    await openStringField()
    fireEvent.change(schemaEditor(), { target: { value: '{"type": ' } })
    expect(await screen.findByText(/showing the last valid schema/i)).toBeTruthy()
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ada')
  })

  it('keeps the last valid form when the adapter rejects the schema', async () => {
    render(<App />)
    await openStringField()
    editSchema((schema) => {
      schema.$defs = { loop: { $ref: '#/$defs/loop' } }
      ;(schema.properties as Record<string, unknown>).loop = { $ref: '#/$defs/loop' }
    })
    expect(await screen.findByText(/showing the last valid schema/i)).toBeTruthy()
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ada')
  })

  it('keeps the example hints after an edit', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Widget selection' }))
    await waitFor(() => expect(screen.getByLabelText('Body').tagName).toBe('TEXTAREA'))
    editSchema((schema) => {
      schema.title = 'Edited article'
    })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(screen.getByLabelText('Body').tagName).toBe('TEXTAREA')
  })

  it('keeps typed data across a renderer switch while a rebuild is pending', async () => {
    render(<App />)
    await openStringField()
    editSchema((schema) => {
      schema.title = 'Renamed'
    })
    fireEvent.change(screen.getByLabelText(/renderer/i), { target: { value: 'vue' } })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(((await screen.findByLabelText('Name')) as HTMLInputElement).value).toBe('Ada')
  })
})
```

The adapter rejection case uses a `$ref` that applies itself at the same location, which `createJsonSchemaAdapter` rejects with `SameLocationCycleError` (checked on 2026-10-12). A `$recursiveRef` with siblings, a missing local `$ref` and a remote `$ref` are all accepted by default, so they do not work here.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/schema-edit-lifecycle.test.tsx`
Expected: FAIL. The first test loses `Ada`; the invalid JSON test finds "Fix the schema JSON to see the form." instead of the notice.

- [ ] **Step 3: Implement in `App.tsx`**

Replace `useAdapter`:

```tsx
interface AdapterState {
  ready: { port: SchemaEvaluationPort; id: number } | null
  loading: boolean
  error: string | null
}

function useAdapter(applied: AppliedSchema | null): AdapterState {
  const [state, setState] = useState<AdapterState>({ ready: null, loading: true, error: null })
  const nextId = useRef(0)

  useEffect(() => {
    if (!applied) return
    let cancelled = false
    setState((previous) => ({ ...previous, loading: true }))
    createJsonSchemaAdapter(applied.parsed)
      .then((port) => {
        if (cancelled) return
        nextId.current += 1
        setState({ ready: { port, id: nextId.current }, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState((previous) => ({ ...previous, loading: false, error: errorMessage(err) }))
      })
    return () => {
      cancelled = true
    }
  }, [applied])

  return state
}
```

In `App`:

1. Replace the `CUSTOM_KEY` and `customEntry` logic with an `edited` flag and a `revision` counter:

```tsx
const [edited, setEdited] = useState(false)
const [revision, setRevision] = useState(0)
const latestData = useRef<{ revision: number; data: unknown } | null>(null)
```

2. `handleSchemaChange` sets the text and `setEdited(true)`. It no longer parses or sets `parseError`, and no longer changes `selectedId`.
3. `handleSelectExample` and the `popstate` handler set the text, `setEdited(false)` and `setRevision((r) => r + 1)`.
4. Remove the `parseError` state. Read it from the hook:

```tsx
const { applied, parseError } = useAppliedSchema(schemaText, revision)
const adapter = useAdapter(applied)
const selectedExample = selectedId === null ? undefined : getExample(selectedId)
const carried = latestData.current?.revision === revision ? latestData.current.data : undefined
const initialData = carried !== undefined ? carried : selectedExample?.initialData
const stale = parseError ?? adapter.error
```

5. The URL effect formats `{ exampleId: edited ? null : selectedId, renderer: rendererKey }`, and `ExampleBrowser` receives `selectedId={edited ? null : selectedId}`. Both keep today's behavior for an edited schema.
6. Render `NotReady` only while `adapter.ready === null`: "Loading…" when `adapter.loading`, otherwise the error. Otherwise render:

```tsx
<FormWorkspace
  key={`${revision}:${adapter.ready.id}`}
  port={adapter.ready.port}
  entry={{ initialData, hints: selectedExample?.hints }}
  stale={stale}
  onDataChange={(data) => {
    latestData.current = { revision, data }
  }}
  renderer={renderers[rendererKey]}
  rendererKey={rendererKey}
  resolvedTheme={theme.resolved}
  schemaText={schemaText}
  tab={inspectorTab}
  toolbar={toolbar}
  onTabChange={setInspectorTab}
/>
```

7. In `FormWorkspace`, add the two props and report data:

```tsx
useEffect(() => {
  onDataChange(form.data)
}, [form.data, onDataChange])
```

and render the notice as the first child of the preview section, after `{toolbar}`:

```tsx
{stale != null && (
  <p className="pg-stale" role="status">
    Showing the last valid schema. {stale}
  </p>
)}
```

8. The parse error line under the editor stays and reads from `parseError`.

In `playground.css`, after `.pg-error`:

```css
.pg-stale {
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--tx-danger);
  border-radius: var(--tx-radius);
  color: var(--tx-danger);
  font-size: 0.85rem;
}
```

- [ ] **Step 4: Run the new tests and the existing playground suite**

Run: `pnpm vitest run --project playground`
Expected: PASS. `inspector.test.tsx` "shows the schema text, including edits" still passes because the Schema tab shows the raw text immediately.

- [ ] **Step 5: Commit**

```bash
git add apps/playground/src/App.tsx apps/playground/src/playground.css apps/playground/src/__tests__/schema-edit-lifecycle.test.tsx
git commit -m "fix(playground): keep form data and the last valid form through schema edits"
```

- [ ] **Step 6: Open the pull request**

Run `pnpm build && pnpm typecheck && pnpm test && pnpm site:build`, push, and open the pull request with "Closes #232" in the body. After merge, on the live site: type into String field, add a property in the schema, and confirm the typed value stays.

---

## PR 1: Workbench shell

Branch `feat/playground-workbench-shell`, from `main` after PR 0 merges. Closes [#231](https://github.com/texaryn/texaryn/issues/231).

Two deliberate details:

- **The renderer select stays in the preview pane header**, on the region it governs, as the existing code comment in `App.tsx` argues. The spec's toolbar listing is updated to match in #242.
- **Panes never unmount for a layout change.** Maximize, Focus and collapse act through `react-resizable-panels` panel handles (`collapse()`, `expand()`), and a hidden pane is marked `inert`. Only the pinned example list unmounts its content when unpinned, because it holds no state and a second copy would duplicate the `Examples` navigation landmark.

Crossing the 800px breakpoint swaps the desktop workbench for the phone one, which remounts the panes. The schema text and form data live above both and survive; the editor's undo history does not. This is accepted.

### Task 3: Layout state

**Files:**
- Create: `apps/playground/src/workbench/layout.ts`
- Test: `apps/playground/src/__tests__/layout.test.ts`

**Interfaces:**
- Produces: `type PaneId = 'schema' | 'preview' | 'inspector'`, `type PreviewWidth = 'phone' | 'tablet' | 'fit'`, `interface LayoutState { version: 1; inspectorCollapsed: boolean; maximized: PaneId | null; focus: boolean; examplesPinned: boolean; previewWidth: PreviewWidth }`, `DEFAULT_LAYOUT`, `type LayoutAction`, `layoutReducer(state, action): LayoutState`, `interface VisiblePanes { examples: boolean; rail: boolean; schema: boolean; preview: boolean; inspector: boolean }`, `visiblePanes(state): VisiblePanes`, `LAYOUT_STORAGE_KEY`, `parseStoredLayout(raw: string | null): LayoutState`, `readStoredLayout(): LayoutState`, `writeStoredLayout(state): void`, `PANEL_STORAGE_PREFIX`, `panelStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void }`, `clearStoredPanelSizes(): void`, `useLayout(): [LayoutState, (action: LayoutAction) => void]`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE_KEY,
  PANEL_STORAGE_PREFIX,
  clearStoredPanelSizes,
  layoutReducer,
  panelStorage,
  parseStoredLayout,
  visiblePanes,
} from '../workbench/layout.js'

beforeEach(() => {
  window.localStorage.clear()
})

describe('layoutReducer', () => {
  it('maximizes a pane and toggles back on a second maximize', () => {
    const max = layoutReducer(DEFAULT_LAYOUT, { type: 'maximize', pane: 'schema' })
    expect(max.maximized).toBe('schema')
    expect(layoutReducer(max, { type: 'maximize', pane: 'schema' }).maximized).toBeNull()
  })

  it('clears Focus when a pane is maximized, and maximize when Focus starts', () => {
    const focused = layoutReducer(DEFAULT_LAYOUT, { type: 'toggleFocus' })
    const max = layoutReducer(focused, { type: 'maximize', pane: 'preview' })
    expect(max).toMatchObject({ focus: false, maximized: 'preview' })
    expect(layoutReducer(max, { type: 'toggleFocus' })).toMatchObject({ focus: true, maximized: null })
  })

  it('restores from both maximize and Focus', () => {
    const max = layoutReducer(DEFAULT_LAYOUT, { type: 'maximize', pane: 'inspector' })
    expect(layoutReducer(max, { type: 'restore' })).toMatchObject({ maximized: null, focus: false })
  })

  it('resets to the defaults', () => {
    const changed = layoutReducer(DEFAULT_LAYOUT, { type: 'setPreviewWidth', width: 'phone' })
    expect(layoutReducer(changed, { type: 'reset' })).toEqual(DEFAULT_LAYOUT)
  })
})

describe('visiblePanes', () => {
  it('shows the pinned list and hides the rail by default', () => {
    expect(visiblePanes(DEFAULT_LAYOUT)).toEqual({
      examples: true,
      rail: false,
      schema: true,
      preview: true,
      inspector: true,
    })
  })

  it('shows the rail when the list is unpinned', () => {
    const state = layoutReducer(DEFAULT_LAYOUT, { type: 'setExamplesPinned', pinned: false })
    expect(visiblePanes(state)).toMatchObject({ examples: false, rail: true })
  })

  it('shows only the maximized pane', () => {
    const state = layoutReducer(DEFAULT_LAYOUT, { type: 'maximize', pane: 'preview' })
    expect(visiblePanes(state)).toEqual({
      examples: false,
      rail: false,
      schema: false,
      preview: true,
      inspector: false,
    })
  })

  it('keeps schema and preview in Focus', () => {
    const state = layoutReducer(DEFAULT_LAYOUT, { type: 'toggleFocus' })
    expect(visiblePanes(state)).toEqual({
      examples: false,
      rail: false,
      schema: true,
      preview: true,
      inspector: false,
    })
  })
})

describe('stored layout', () => {
  it('falls back to the defaults for missing, corrupt or other-version data', () => {
    expect(parseStoredLayout(null)).toEqual(DEFAULT_LAYOUT)
    expect(parseStoredLayout('{not json')).toEqual(DEFAULT_LAYOUT)
    expect(parseStoredLayout(JSON.stringify({ ...DEFAULT_LAYOUT, version: 2 }))).toEqual(DEFAULT_LAYOUT)
  })

  it('keeps valid fields and replaces invalid ones', () => {
    const raw = JSON.stringify({ version: 1, inspectorCollapsed: true, maximized: 'nowhere', previewWidth: 'tablet' })
    expect(parseStoredLayout(raw)).toEqual({
      ...DEFAULT_LAYOUT,
      inspectorCollapsed: true,
      previewWidth: 'tablet',
    })
  })

  it('namespaces panel sizes and clears only its own keys', () => {
    panelStorage.setItem('columns', '{"examples":216}')
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, '{}')
    expect(window.localStorage.getItem(`${PANEL_STORAGE_PREFIX}columns`)).toBe('{"examples":216}')
    clearStoredPanelSizes()
    expect(panelStorage.getItem('columns')).toBeNull()
    expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('{}')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/layout.test.ts`
Expected: FAIL, cannot resolve `../workbench/layout.js`.

- [ ] **Step 3: Implement `apps/playground/src/workbench/layout.ts`**

```ts
import { useEffect, useReducer } from 'react'

export type PaneId = 'schema' | 'preview' | 'inspector'
export type PreviewWidth = 'phone' | 'tablet' | 'fit'

export interface LayoutState {
  version: 1
  inspectorCollapsed: boolean
  maximized: PaneId | null
  focus: boolean
  examplesPinned: boolean
  previewWidth: PreviewWidth
}

export const DEFAULT_LAYOUT: LayoutState = {
  version: 1,
  inspectorCollapsed: false,
  maximized: null,
  focus: false,
  examplesPinned: true,
  previewWidth: 'fit',
}

export type LayoutAction =
  | { type: 'toggleInspector' }
  | { type: 'setInspectorCollapsed'; collapsed: boolean }
  | { type: 'maximize'; pane: PaneId }
  | { type: 'restore' }
  | { type: 'toggleFocus' }
  | { type: 'setExamplesPinned'; pinned: boolean }
  | { type: 'setPreviewWidth'; width: PreviewWidth }
  | { type: 'reset' }

export function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case 'toggleInspector':
      return { ...state, inspectorCollapsed: !state.inspectorCollapsed }
    case 'setInspectorCollapsed':
      return { ...state, inspectorCollapsed: action.collapsed }
    case 'maximize':
      return state.maximized === action.pane
        ? { ...state, maximized: null }
        : { ...state, maximized: action.pane, focus: false }
    case 'restore':
      return { ...state, maximized: null, focus: false }
    case 'toggleFocus':
      return { ...state, focus: !state.focus, maximized: null }
    case 'setExamplesPinned':
      return { ...state, examplesPinned: action.pinned }
    case 'setPreviewWidth':
      return { ...state, previewWidth: action.width }
    case 'reset':
      return DEFAULT_LAYOUT
  }
}

export interface VisiblePanes {
  examples: boolean
  rail: boolean
  schema: boolean
  preview: boolean
  inspector: boolean
}

export function visiblePanes(state: LayoutState): VisiblePanes {
  if (state.maximized) {
    return {
      examples: false,
      rail: false,
      schema: state.maximized === 'schema',
      preview: state.maximized === 'preview',
      inspector: state.maximized === 'inspector',
    }
  }
  if (state.focus) {
    return { examples: false, rail: false, schema: true, preview: true, inspector: false }
  }
  return {
    examples: state.examplesPinned,
    rail: !state.examplesPinned,
    schema: true,
    preview: true,
    inspector: true,
  }
}

export const LAYOUT_STORAGE_KEY = 'texaryn-playground-layout'
const PANES: readonly PaneId[] = ['schema', 'preview', 'inspector']
const WIDTHS: readonly PreviewWidth[] = ['phone', 'tablet', 'fit']

export function parseStoredLayout(raw: string | null): LayoutState {
  if (raw === null) return DEFAULT_LAYOUT
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return DEFAULT_LAYOUT
  }
  if (typeof value !== 'object' || value === null) return DEFAULT_LAYOUT
  const stored = value as Record<string, unknown>
  if (stored.version !== 1) return DEFAULT_LAYOUT
  const flag = (key: keyof LayoutState, fallback: boolean): boolean =>
    typeof stored[key] === 'boolean' ? (stored[key] as boolean) : fallback
  return {
    version: 1,
    inspectorCollapsed: flag('inspectorCollapsed', DEFAULT_LAYOUT.inspectorCollapsed),
    maximized: PANES.includes(stored.maximized as PaneId) ? (stored.maximized as PaneId) : null,
    focus: flag('focus', DEFAULT_LAYOUT.focus),
    examplesPinned: flag('examplesPinned', DEFAULT_LAYOUT.examplesPinned),
    previewWidth: WIDTHS.includes(stored.previewWidth as PreviewWidth)
      ? (stored.previewWidth as PreviewWidth)
      : DEFAULT_LAYOUT.previewWidth,
  }
}

export function readStoredLayout(): LayoutState {
  try {
    return parseStoredLayout(window.localStorage.getItem(LAYOUT_STORAGE_KEY))
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function writeStoredLayout(state: LayoutState): void {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable; the layout still applies to this page.
  }
}

export const PANEL_STORAGE_PREFIX = 'texaryn-playground-panels:'

export const panelStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(PANEL_STORAGE_PREFIX + key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(PANEL_STORAGE_PREFIX + key, value)
    } catch {
      // As above.
    }
  },
}

export function clearStoredPanelSizes(): void {
  try {
    const keys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(PANEL_STORAGE_PREFIX)) keys.push(key)
    }
    for (const key of keys) window.localStorage.removeItem(key)
  } catch {
    // As above.
  }
}

export function useLayout(): [LayoutState, (action: LayoutAction) => void] {
  const [state, dispatch] = useReducer(layoutReducer, undefined, readStoredLayout)
  useEffect(() => {
    writeStoredLayout(state)
  }, [state])
  return [state, dispatch]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run --project playground src/__tests__/layout.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/playground/src/workbench/layout.ts apps/playground/src/__tests__/layout.test.ts
git commit -m "feat(playground): add the workbench layout state"
```

### Task 4: Lift the runtime above the layout

**Files:**
- Create: `apps/playground/src/renderers.ts` (move `RendererSpec` and `renderers` out of `App.tsx` unchanged)
- Create: `apps/playground/src/workbench/workspace.tsx`
- Create: `apps/playground/src/workbench/PreviewPane.tsx`
- Create: `apps/playground/src/workbench/InspectorPane.tsx`
- Modify: `apps/playground/src/App.tsx` (remove `FormWorkspace`, the `latestData` ref and `onDataChange` from PR 0; render the panes inside the existing `pg-columns` grid)
- Test: `apps/playground/src/__tests__/workspace.test.tsx`

**Interfaces:**
- Consumes: `AdapterState['ready']` from Task 2.
- Produces: `interface Workspace { runtime: FormRuntime; port: SchemaEvaluationPort; runtimeId: string; hints: UIHints | undefined }`, `useWorkspaceRuntime(input: WorkspaceInput): Workspace | null`, `interface WorkspaceInput { ready: { port: SchemaEvaluationPort; id: number } | null; revision: number; initialData: unknown; hints: UIHints | undefined; onSubmit: (data: unknown) => Promise<void> }`, `WorkspaceProvider`, `useWorkspace(): Workspace`.
- Produces: `PreviewPane` props `{ renderer: RendererSpec; rendererKey: RendererKey; resolvedTheme: ResolvedTheme; stale: string | null; simulateFailure: boolean; onSimulateFailureChange: (value: boolean) => void }`; `InspectorPane` props `{ schemaText: string; tab: Tab; onTabChange: (tab: Tab) => void }`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { App } from '../App.js'

afterEach(cleanup)

describe('the workspace runtime', () => {
  it('survives shell re-renders without remounting the form', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Ada' } })

    fireEvent.click(screen.getByRole('tab', { name: 'IR' }))
    fireEvent.change(screen.getByLabelText('Select theme'), { target: { value: 'dark' } })

    expect(screen.getByLabelText('Name')).toBe(name)
    expect(name.value).toBe('Ada')
  })

  it('keeps Simulate failure across a schema rebuild', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    const simulate = (await screen.findByLabelText(/simulate failure/i)) as HTMLInputElement
    fireEvent.click(simulate)
    const editor = screen.getByLabelText(/^JSON Schema/) as HTMLTextAreaElement
    const schema = JSON.parse(editor.value) as Record<string, unknown>
    schema.title = 'Renamed'
    fireEvent.change(editor, { target: { value: JSON.stringify(schema, null, 2) } })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect((screen.getByLabelText(/simulate failure/i) as HTMLInputElement).checked).toBe(true)
  })
})
```

`Select theme` is the accessible name `ThemeSelect.tsx` gives its control, as `theme.test.tsx` already uses.

- [ ] **Step 2: Run to verify the second test fails**

Run: `pnpm vitest run --project playground src/__tests__/workspace.test.tsx`
Expected: the Simulate failure test FAILS, because the checkbox state lives in `FormWorkspace`, which remounts on a rebuild.

- [ ] **Step 3: Implement**

`apps/playground/src/workbench/workspace.tsx`:

```tsx
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime, SchemaEvaluationPort, UIHints } from '@texaryn/core'

export interface Workspace {
  runtime: FormRuntime
  port: SchemaEvaluationPort
  runtimeId: string
  hints: UIHints | undefined
}

export interface WorkspaceInput {
  ready: { port: SchemaEvaluationPort; id: number } | null
  revision: number
  initialData: unknown
  hints: UIHints | undefined
  onSubmit: (data: unknown) => Promise<void>
}

// `useForm` creates its runtime once per mount, so a new schema would need a
// remount. Creating the runtime here lets panes keep their DOM across rebuilds.
export function useWorkspaceRuntime(input: WorkspaceInput): Workspace | null {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const previous = useRef<{ revision: number; runtime: FormRuntime } | null>(null)
  const latest = useRef(input)
  latest.current = input
  const { ready, revision } = input

  useEffect(() => {
    if (!ready) return
    const prior = previous.current
    // The same revision means the schema was edited, so the data carries over.
    const initialData =
      prior !== null && prior.revision === revision
        ? prior.runtime.data.getSnapshot()
        : latest.current.initialData
    const runtime = createFormRuntime(ready.port, {
      initialData,
      hints: latest.current.hints,
      onSubmit: (data) => latest.current.onSubmit(data),
    })
    previous.current = { revision, runtime }
    setWorkspace({
      runtime,
      port: ready.port,
      runtimeId: `${revision}:${ready.id}`,
      hints: latest.current.hints,
    })
    return () => {
      // The next runtime reads this one's data synchronously first.
      setTimeout(() => runtime.destroy(), 0)
    }
  }, [ready, revision])

  return workspace
}

const WorkspaceContext = createContext<Workspace | null>(null)

export const WorkspaceProvider = WorkspaceContext.Provider

export function useWorkspace(): Workspace {
  const workspace = useContext(WorkspaceContext)
  if (!workspace) throw new Error('useWorkspace must be used within a WorkspaceProvider')
  return workspace
}
```

`FormRuntime.data` is a `Store<unknown>` (`packages/core/src/runtime/types.ts`), and `Store<T>` exposes `getSnapshot()` (`packages/core/src/state/store.ts`).

`apps/playground/src/workbench/PreviewPane.tsx` (the body of today's preview section, reading the runtime from context; the surface is keyed so framework hosts mount once per runtime):

```tsx
import { ErrorSummary, FormProvider, FormRoot, useStore } from '@texaryn/react'
import { RendererSurface } from '../RendererSurface.js'
import type { RendererSpec } from '../renderers.js'
import type { RendererKey } from '../routing.js'
import type { ResolvedTheme } from '../theme.js'
import { useWorkspace } from './workspace.js'

export function PreviewPane({
  renderer,
  rendererKey,
  resolvedTheme,
  stale,
  simulateFailure,
  onSimulateFailureChange,
}: {
  renderer: RendererSpec
  rendererKey: RendererKey
  resolvedTheme: ResolvedTheme
  stale: string | null
  simulateFailure: boolean
  onSimulateFailureChange: (value: boolean) => void
}) {
  const { runtime, runtimeId } = useWorkspace()
  const submission = useStore(runtime.submission)
  const busy = submission.status === 'validating' || submission.status === 'submitting'

  return (
    <FormProvider value={runtime}>
      {stale != null && (
        <p className="pg-stale" role="status">
          Showing the last valid schema. {stale}
        </p>
      )}
      <ErrorSummary />
      <RendererSurface key={runtimeId} rendererKey={rendererKey} label={renderer.label} theme={resolvedTheme}>
        {renderer.kind === 'react' ? <FormRoot registry={renderer.registry} /> : <renderer.Host runtime={runtime} />}
      </RendererSurface>
      <section className="pg-controls" aria-labelledby="playground-controls">
        <h2 className="pg-controls__title" id="playground-controls">
          Playground controls
        </h2>
        <div className="pg-submit-row">
          <button
            type="button"
            className="pg-button"
            disabled={busy}
            onClick={() => runtime.dispatch({ type: 'Submit' })}
          >
            {submission.status === 'validating'
              ? 'Validating...'
              : submission.status === 'submitting'
                ? 'Submitting...'
                : 'Submit'}
          </button>
          <label className="pg-checkbox-label">
            <input
              type="checkbox"
              checked={simulateFailure}
              onChange={(event) => onSimulateFailureChange(event.target.checked)}
            />
            Simulate failure
          </label>
        </div>
        {submission.status === 'submitted' && <p className="pg-success">Submitted successfully.</p>}
        {submission.error != null && (
          <p className="pg-error">
            {submission.error instanceof Error ? submission.error.message : String(submission.error)}
          </p>
        )}
      </section>
    </FormProvider>
  )
}
```

`apps/playground/src/workbench/InspectorPane.tsx`:

```tsx
import { useStore } from '@texaryn/react'
import { Inspector } from '../Inspector.js'
import type { Tab } from '../Inspector.js'
import { useWorkspace } from './workspace.js'

export function InspectorPane({
  schemaText,
  tab,
  onTabChange,
}: {
  schemaText: string
  tab: Tab
  onTabChange: (tab: Tab) => void
}) {
  const { runtime, port, hints } = useWorkspace()
  const data = useStore(runtime.data)
  const submission = useStore(runtime.submission)
  const document = useStore(runtime.document)
  return (
    <Inspector
      runtime={runtime}
      port={port}
      data={data}
      submission={submission}
      document={document}
      schemaText={schemaText}
      hints={hints}
      tab={tab}
      onTabChange={onTabChange}
    />
  )
}
```

In `App.tsx`: move `simulateFailure` state up, build `onSubmit` once, and call the hook:

```tsx
const [simulateFailure, setSimulateFailure] = useState(false)
const simulateFailureRef = useRef(false)
simulateFailureRef.current = simulateFailure
const onSubmit = useCallback(async (data: unknown) => {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (simulateFailureRef.current) throw new Error('Simulated submission failure')
  console.log('Submitted:', data)
}, [])
const workspace = useWorkspaceRuntime({
  ready: adapter.ready,
  revision,
  initialData: selectedExample?.initialData,
  hints: selectedExample?.hints,
  onSubmit,
})
```

and replace the `FormWorkspace` branch with:

```tsx
{workspace ? (
  <WorkspaceProvider value={workspace}>
    <section className="pg-col pg-col--preview">
      {toolbar}
      <PreviewPane
        renderer={renderers[rendererKey]}
        rendererKey={rendererKey}
        resolvedTheme={theme.resolved}
        stale={stale}
        simulateFailure={simulateFailure}
        onSimulateFailureChange={setSimulateFailure}
      />
    </section>
    <aside className="pg-col pg-col--inspect" aria-label="Inspector">
      <InspectorPane schemaText={schemaText} tab={inspectorTab} onTabChange={setInspectorTab} />
    </aside>
  </WorkspaceProvider>
) : (
  <NotReady toolbar={toolbar}>
    {adapter.loading ? <p className="pg-empty">Loading…</p> : <p className="pg-error">{adapter.error}</p>}
  </NotReady>
)}
```

- [ ] **Step 4: Run the whole playground project**

Run: `pnpm vitest run --project playground`
Expected: PASS, including `renderer-switch`, `renderer-boundary`, `schema-edit-lifecycle` and the new file.

- [ ] **Step 5: Commit**

```bash
git add apps/playground/src
git commit -m "refactor(playground): own the form runtime above the panes"
```

### Task 5: Resizable workbench with pane actions

**Files:**
- Modify: `apps/playground/package.json` (`pnpm --filter @texaryn/playground add -E react-resizable-panels@4.14.4`)
- Create: `apps/playground/src/workbench/Workbench.tsx`
- Create: `apps/playground/src/workbench/PaneHeader.tsx`
- Create: `apps/playground/src/workbench/Toolbar.tsx` (today's `<header>` plus Focus and Reset layout)
- Modify: `apps/playground/src/App.tsx` (render `Toolbar` and `Workbench` instead of `pg-header` and `pg-columns`)
- Modify: `apps/playground/src/playground.css` (replace the `.pg-columns` grid and its media queries with workbench rules)
- Modify: `apps/playground/src/test-setup.ts` (`ResizeObserver` stub)
- Test: `apps/playground/src/__tests__/workbench.test.tsx`

**Interfaces:**
- Consumes: `LayoutState`, `LayoutAction`, `visiblePanes`, `panelStorage`, `clearStoredPanelSizes`, `useLayout` (Task 3); `PreviewPane`, `InspectorPane` (Task 4).
- Produces: `Workbench` props `{ layout: LayoutState; dispatch: (action: LayoutAction) => void; resetSignal: number; rail: ReactNode; examples: ReactNode; schema: ReactNode; preview: ReactNode; inspector: ReactNode }`. Each pane renders as `<section data-pane="<id>" aria-label="<Title>" inert={!visible}>`.
- Produces: `PaneHeader` props `{ title: string; children?: ReactNode; actions?: ReactNode }`, `MaximizeButton` props `{ pane: PaneId; label: string; layout: LayoutState; dispatch: (action: LayoutAction) => void }`.

- [ ] **Step 1: Add the `ResizeObserver` stub to `test-setup.ts`**

`react-resizable-panels` constructs a `ResizeObserver`, which jsdom lacks; without it rendering fails with "is not a constructor" (checked 2026-10-12 against jsdom 25).

```ts
if (!('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: ResizeObserverStub })
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub })
}
```

- [ ] **Step 2: Write the failing tests**

```tsx
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { App } from '../App.js'

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

function pane(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-pane="${id}"]`)
  if (!element) throw new Error(`no pane ${id}`)
  return element
}

async function openWithData(): Promise<HTMLInputElement> {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
  const name = (await screen.findByLabelText('Name')) as HTMLInputElement
  fireEvent.change(name, { target: { value: 'Ada' } })
  return name
}

describe('the workbench', () => {
  it('maximizes the schema pane and restores without remounting the form', async () => {
    const name = await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Maximize schema' }))
    expect(pane('preview').hasAttribute('inert')).toBe(true)
    expect(pane('inspector').hasAttribute('inert')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Restore schema' }))
    expect(pane('preview').hasAttribute('inert')).toBe(false)
    expect(screen.getByLabelText('Name')).toBe(name)
    expect(name.value).toBe('Ada')
  })

  it('hides the example list and the inspector in Focus', async () => {
    await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }))
    expect(pane('examples').hasAttribute('inert')).toBe(true)
    expect(pane('inspector').hasAttribute('inert')).toBe(true)
    expect(pane('schema').hasAttribute('inert')).toBe(false)
  })

  it('collapses the inspector to its header', async () => {
    await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }))
    expect(screen.getByRole('button', { name: 'Expand inspector' })).toBeTruthy()
  })

  it('names every separator', async () => {
    await openWithData()
    for (const name of [
      'Resize examples and workspace',
      'Resize schema and preview',
      'Resize workspace and inspector',
    ]) {
      expect(screen.getByRole('separator', { name })).toBeTruthy()
    }
  })

  it('remembers a collapsed inspector across a reload and forgets it on reset', async () => {
    await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }))
    cleanup()
    await openWithData()
    expect(screen.getByRole('button', { name: 'Expand inspector' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }))
    expect(screen.getByRole('button', { name: 'Collapse inspector' })).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/workbench.test.tsx`
Expected: FAIL, no "Maximize schema" button.

- [ ] **Step 4: Implement**

`apps/playground/src/workbench/PaneHeader.tsx`:

```tsx
import type { ReactNode } from 'react'
import type { LayoutAction, LayoutState, PaneId } from './layout.js'

export function PaneHeader({
  title,
  children,
  actions,
}: {
  title: string
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="pg-pane__header">
      <h2 className="pg-pane__title">{title}</h2>
      {children}
      <div className="pg-pane__actions">{actions}</div>
    </header>
  )
}

export function MaximizeButton({
  pane,
  label,
  layout,
  dispatch,
}: {
  pane: PaneId
  label: string
  layout: LayoutState
  dispatch: (action: LayoutAction) => void
}) {
  const maximized = layout.maximized === pane
  return (
    <button
      type="button"
      className="pg-pane__action"
      aria-label={`${maximized ? 'Restore' : 'Maximize'} ${label}`}
      onClick={() => dispatch(maximized ? { type: 'restore' } : { type: 'maximize', pane })}
    >
      {maximized ? 'Restore' : 'Maximize'}
    </button>
  )
}
```

`apps/playground/src/workbench/Workbench.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { panelStorage, visiblePanes } from './layout.js'
import type { LayoutAction, LayoutState } from './layout.js'

const INSPECTOR_HEADER_PX = 32

const TITLES = {
  examples: 'Examples',
  schema: 'Schema',
  preview: 'Preview',
  inspector: 'Inspector',
} as const

export function Pane({
  id,
  visible,
  children,
}: {
  id: keyof typeof TITLES
  visible: boolean
  children: ReactNode
}) {
  return (
    <section className="pg-pane" data-pane={id} aria-label={TITLES[id]} inert={!visible}>
      {children}
    </section>
  )
}

function show(ref: RefObject<PanelImperativeHandle | null>, visible: boolean): void {
  const panel = ref.current
  if (!panel) return
  if (visible && panel.isCollapsed()) panel.expand()
  if (!visible && !panel.isCollapsed()) panel.collapse()
}

export function Workbench({
  layout,
  dispatch,
  resetSignal,
  rail,
  examples,
  schema,
  preview,
  inspector,
}: {
  layout: LayoutState
  dispatch: (action: LayoutAction) => void
  resetSignal: number
  rail: ReactNode
  examples: ReactNode
  schema: ReactNode
  preview: ReactNode
  inspector: ReactNode
}) {
  const visible = visiblePanes(layout)
  const examplesRef = usePanelRef()
  const topRef = usePanelRef()
  const schemaRef = usePanelRef()
  const previewRef = usePanelRef()
  const inspectorRef = usePanelRef()
  const columns = useDefaultLayout({ id: 'columns', storage: panelStorage })
  const rows = useDefaultLayout({ id: 'rows', storage: panelStorage })
  const split = useDefaultLayout({ id: 'split', storage: panelStorage })
  const firstReset = useRef(resetSignal)

  useEffect(() => {
    show(examplesRef, visible.examples)
    show(schemaRef, visible.schema)
    show(previewRef, visible.preview)
    show(topRef, visible.schema || visible.preview)
    show(inspectorRef, visible.inspector && !layout.inspectorCollapsed)
  }, [visible.examples, visible.schema, visible.preview, visible.inspector, layout.inspectorCollapsed])

  useEffect(() => {
    if (resetSignal === firstReset.current) return
    examplesRef.current?.resize(216)
    schemaRef.current?.resize('46')
    previewRef.current?.resize('54')
    topRef.current?.resize('72')
    inspectorRef.current?.resize('28')
  }, [resetSignal])

  return (
    <div className="pg-workbench">
      {visible.rail && (
        <nav className="pg-rail" aria-label="Workbench">
          {rail}
        </nav>
      )}
      <Group
        className="pg-workbench__columns"
        orientation="horizontal"
        defaultLayout={columns.defaultLayout}
        onLayoutChanged={columns.onLayoutChanged}
      >
        <Panel id="examples" panelRef={examplesRef} defaultSize={216} minSize={160} collapsible collapsedSize={0}>
          <Pane id="examples" visible={visible.examples}>
            {visible.examples ? examples : null}
          </Pane>
        </Panel>
        <Separator className="pg-separator" aria-label="Resize examples and workspace" />
        <Panel id="main" minSize={600}>
          <Group orientation="vertical" defaultLayout={rows.defaultLayout} onLayoutChanged={rows.onLayoutChanged}>
            <Panel id="top" panelRef={topRef} defaultSize="72" collapsible collapsedSize={0}>
              <Group orientation="horizontal" defaultLayout={split.defaultLayout} onLayoutChanged={split.onLayoutChanged}>
                <Panel id="schema" panelRef={schemaRef} defaultSize="46" minSize={280} collapsible collapsedSize={0}>
                  <Pane id="schema" visible={visible.schema}>
                    {schema}
                  </Pane>
                </Panel>
                <Separator className="pg-separator" aria-label="Resize schema and preview" />
                <Panel id="preview" panelRef={previewRef} defaultSize="54" minSize={320} collapsible collapsedSize={0}>
                  <Pane id="preview" visible={visible.preview}>
                    {preview}
                  </Pane>
                </Panel>
              </Group>
            </Panel>
            <Separator className="pg-separator pg-separator--row" aria-label="Resize workspace and inspector" />
            <Panel
              id="inspector"
              panelRef={inspectorRef}
              defaultSize="28"
              minSize={120}
              collapsible
              collapsedSize={INSPECTOR_HEADER_PX}
              onResize={() => {
                const panel = inspectorRef.current
                if (!panel || !visible.inspector || layout.maximized || layout.focus) return
                if (panel.isCollapsed() !== layout.inspectorCollapsed) {
                  dispatch({ type: 'setInspectorCollapsed', collapsed: panel.isCollapsed() })
                }
              }}
            >
              <Pane id="inspector" visible={visible.inspector}>
                {inspector}
              </Pane>
            </Panel>
          </Group>
        </Panel>
      </Group>
    </div>
  )
}
```

`apps/playground/src/workbench/Toolbar.tsx` keeps today's brand, Docs and GitHub links and `ThemeSelect`, and adds, before the theme control:

```tsx
<button type="button" className="pg-toolbar__button" aria-pressed={layout.focus} onClick={() => dispatch({ type: 'toggleFocus' })}>
  Focus
</button>
<button type="button" className="pg-toolbar__button" onClick={onResetLayout}>
  Reset layout
</button>
```

with props `{ title: string; edited: boolean; layout: LayoutState; dispatch: (action: LayoutAction) => void; onResetLayout: () => void; theme: ThemeState; docsUrl: string; repositoryUrl: string }`. The title shows the example title, plus "(edited)" when `edited`.

In `App.tsx`:

```tsx
const [layout, dispatchLayout] = useLayout()
const [resetSignal, setResetSignal] = useState(0)
const resetLayout = useCallback(() => {
  clearStoredPanelSizes()
  dispatchLayout({ type: 'reset' })
  setResetSignal((signal) => signal + 1)
}, [dispatchLayout])
```

The schema pane content is today's `JSON Schema` heading, Visual and JSON switch, editor and parse error, under `<PaneHeader title="Schema" actions={<MaximizeButton pane="schema" label="schema" layout={layout} dispatch={dispatchLayout} />} />`. The preview pane is `PaneHeader` with the renderer select as its child and a `MaximizeButton`, then `PreviewPane`. The inspector pane is `PaneHeader` with two actions, the collapse toggle and a `MaximizeButton`:

```tsx
<button
  type="button"
  className="pg-pane__action"
  aria-label={layout.inspectorCollapsed ? 'Expand inspector' : 'Collapse inspector'}
  onClick={() => dispatchLayout({ type: 'toggleInspector' })}
>
  {layout.inspectorCollapsed ? 'Expand' : 'Collapse'}
</button>
```

When there is no workspace yet, the preview and inspector slots render today's `NotReady` content.

In `playground.css`, delete `.pg-columns`, `.pg-col*` and the two media queries at the end, and add (colors only through `--tx-*` tokens):

```css
.pg-app {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100dvh;
}

.pg-workbench {
  display: flex;
  min-height: 0;
}

.pg-workbench__columns {
  flex: 1 1 auto;
  min-width: 0;
}

.pg-rail {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 40px;
  padding: 0.5rem 0;
  border-right: 1px solid var(--tx-border);
  background: var(--tx-surface);
}

.pg-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: auto;
  background: var(--tx-surface);
}

.pg-pane[data-pane='preview'] {
  background: var(--tx-surface-raised);
}

.pg-pane__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 32px;
  padding: 0 0.75rem;
  border-bottom: 1px solid var(--tx-border);
  font-size: 0.8rem;
}

.pg-pane__title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--tx-text-muted);
}

.pg-pane__actions {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}

.pg-pane__action {
  font: inherit;
  padding: 0.15rem 0.5rem;
  color: var(--tx-text-muted);
  background: none;
  border: 1px solid transparent;
  border-radius: var(--tx-radius);
  cursor: pointer;
}

.pg-pane__action:hover,
.pg-pane__action:focus-visible {
  color: var(--tx-text);
  border-color: var(--tx-border);
}

.pg-separator {
  flex: 0 0 4px;
  background: var(--tx-border);
}

.pg-separator:hover,
.pg-separator:focus-visible {
  background: var(--tx-accent);
}

.pg-schema-editor {
  display: block;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
```

and add `wrap="off"` to the schema `<textarea>`.

- [ ] **Step 5: Run the playground project**

Run: `pnpm vitest run --project playground`
Expected: PASS. If an existing test relied on the `Live Data` heading of the old `NotReady` inspector, update it to the new pane structure and say so in the commit body.

- [ ] **Step 6: Commit**

```bash
git add apps/playground pnpm-lock.yaml
git commit -m "feat(playground): resizable workbench with maximize, Focus and a collapsible inspector"
```

### Task 6: Example list, rail and overlay

**Files:**
- Create: `apps/playground/src/workbench/ExampleExplorer.tsx`
- Modify: `apps/playground/src/ExampleBrowser.tsx` (scroll the selection into view)
- Modify: `apps/playground/src/App.tsx` (pass `examples` and `rail` slots, own `drawerOpen`)
- Modify: `apps/playground/src/test-setup.ts` (`scrollIntoView` stub)
- Modify: `apps/playground/src/playground.css` (`.pg-drawer`)
- Test: `apps/playground/src/__tests__/example-explorer.test.tsx`

**Interfaces:**
- Consumes: `LayoutState`, `LayoutAction` (Task 3).
- Produces: `ExampleList` props `{ onUnpin: () => void; children: ReactNode }` (the pinned panel content), `ExampleRail` props `{ open: boolean; onToggle: () => void; buttonRef: RefObject<HTMLButtonElement | null> }`, `ExampleDrawer` props `{ onClose: () => void; onPin: () => void; children: ReactNode }`.

- [ ] **Step 1: Add the `scrollIntoView` stub to `test-setup.ts`**

jsdom 25 has no `Element.prototype.scrollIntoView` (checked 2026-10-12).

```ts
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {}
}
```

- [ ] **Step 2: Write the failing tests**

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { App } from '../App.js'

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the example list', () => {
  it('starts pinned so a first visit shows the catalog', async () => {
    render(<App />)
    expect(await screen.findByRole('navigation', { name: 'Examples' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open examples' })).toBeNull()
  })

  it('moves to the rail when unpinned and opens as an overlay', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Unpin examples' }))
    expect(screen.queryByRole('navigation', { name: 'Examples' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open examples' }))
    const drawer = screen.getByRole('dialog', { name: 'Examples' })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Number field' }))
    expect(screen.queryByRole('dialog', { name: 'Examples' })).toBeNull()
    expect(await screen.findByLabelText('Price')).toBeTruthy()
  })

  it('closes the overlay on Escape and returns focus to the rail button', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Unpin examples' }))
    const open = screen.getByRole('button', { name: 'Open examples' })
    fireEvent.click(open)
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Examples' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Examples' })).toBeNull()
    expect(document.activeElement).toBe(open)
  })

  it('scrolls the selected example into view', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'oneOf' }))
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
  })
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/example-explorer.test.tsx`
Expected: FAIL, no "Unpin examples" button.

- [ ] **Step 4: Implement**

In `ExampleBrowser.tsx`, keep a ref on the selected button and scroll it when the selection changes:

```tsx
const selectedRef = useRef<HTMLButtonElement | null>(null)
useEffect(() => {
  selectedRef.current?.scrollIntoView({ block: 'nearest' })
}, [selectedId])
```

and on each item `ref={example.id === selectedId ? selectedRef : undefined}`.

`apps/playground/src/workbench/ExampleExplorer.tsx`:

```tsx
import type { ReactNode, RefObject } from 'react'
import { PaneHeader } from './PaneHeader.js'

export function ExampleList({ onUnpin, children }: { onUnpin: () => void; children: ReactNode }) {
  return (
    <>
      <PaneHeader
        title="Examples"
        actions={
          <button type="button" className="pg-pane__action" aria-label="Unpin examples" onClick={onUnpin}>
            Unpin
          </button>
        }
      />
      {children}
    </>
  )
}

export function ExampleRail({
  open,
  onToggle,
  buttonRef,
}: {
  open: boolean
  onToggle: () => void
  buttonRef: RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="pg-rail__button"
      aria-label="Open examples"
      aria-expanded={open}
      aria-controls="example-drawer"
      onClick={onToggle}
    >
      Examples
    </button>
  )
}

export function ExampleDrawer({
  onClose,
  onPin,
  children,
}: {
  onClose: () => void
  onPin: () => void
  children: ReactNode
}) {
  return (
    <div
      id="example-drawer"
      className="pg-drawer"
      role="dialog"
      aria-label="Examples"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <PaneHeader
        title="Examples"
        actions={
          <>
            <button type="button" className="pg-pane__action" aria-label="Pin examples" onClick={onPin}>
              Pin
            </button>
            <button type="button" className="pg-pane__action" aria-label="Close examples" onClick={onClose}>
              Close
            </button>
          </>
        }
      />
      {children}
    </div>
  )
}
```

In `App.tsx`:

```tsx
const [drawerOpen, setDrawerOpen] = useState(false)
const railButton = useRef<HTMLButtonElement | null>(null)
const closeDrawer = useCallback(() => {
  setDrawerOpen(false)
  railButton.current?.focus()
}, [])
```

Selecting an example from the drawer calls `handleSelectExample` then `setDrawerOpen(false)`. `onUnpin` dispatches `setExamplesPinned(false)`; `onPin` dispatches `setExamplesPinned(true)` and closes the drawer. Render the drawer next to the workbench when `drawerOpen` is true.

`playground.css`:

```css
.pg-drawer {
  position: absolute;
  inset: 0 auto 0 40px;
  z-index: 2;
  width: 260px;
  display: flex;
  flex-direction: column;
  overflow: auto;
  background: var(--tx-surface-raised);
  border-right: 1px solid var(--tx-border-strong);
}
```

and `position: relative` on `.pg-workbench`.

- [ ] **Step 5: Run the playground project**

Run: `pnpm vitest run --project playground`
Expected: PASS, including `example-browser.test.tsx`, which finds the pinned list.

- [ ] **Step 6: Commit**

```bash
git add apps/playground/src
git commit -m "feat(playground): pinned example list with a rail and overlay"
```

### Task 7: Phone layout

**Files:**
- Create: `apps/playground/src/workbench/use-narrow-viewport.ts`
- Create: `apps/playground/src/workbench/PhoneWorkbench.tsx`
- Modify: `apps/playground/src/App.tsx` (choose the workbench by width; an Examples button in the toolbar when narrow)
- Modify: `apps/playground/src/playground.css` (`.pg-phone`)
- Test: `apps/playground/src/__tests__/phone-layout.test.tsx`

**Interfaces:**
- Consumes: `Pane` from Task 5.
- Produces: `NARROW_QUERY = '(max-width: 799px)'`, `useNarrowViewport(): boolean`, `type PhoneView = 'preview' | 'schema' | 'inspector'`, `PhoneWorkbench` props `{ view: PhoneView; onViewChange: (view: PhoneView) => void; schema: ReactNode; preview: ReactNode; inspector: ReactNode }`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { App } from '../App.js'
import { resetMediaQueries, setMediaQuery } from '../test-setup.js'
import { NARROW_QUERY } from '../workbench/use-narrow-viewport.js'

beforeEach(() => setMediaQuery(NARROW_QUERY, true))
afterEach(() => {
  cleanup()
  resetMediaQueries()
})

describe('the phone layout', () => {
  it('opens on Preview with no separators', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Preview', pressed: true })).toBeTruthy()
    expect(screen.queryAllByRole('separator')).toHaveLength(0)
  })

  it('keeps form data while switching views', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Examples' }))
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Ada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Schema' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByLabelText('Name')).toBe(name)
    expect(name.value).toBe('Ada')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/phone-layout.test.tsx`
Expected: FAIL, no Preview switch.

- [ ] **Step 3: Implement**

`apps/playground/src/workbench/use-narrow-viewport.ts`:

```ts
import { useEffect, useState } from 'react'

export const NARROW_QUERY = '(max-width: 799px)'

export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY)
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches)
    setNarrow(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return narrow
}
```

`apps/playground/src/workbench/PhoneWorkbench.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Pane } from './Workbench.js'

export type PhoneView = 'preview' | 'schema' | 'inspector'

const VIEWS: readonly { id: PhoneView; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'schema', label: 'Schema' },
  { id: 'inspector', label: 'Inspector' },
]

export function PhoneWorkbench({
  view,
  onViewChange,
  schema,
  preview,
  inspector,
}: {
  view: PhoneView
  onViewChange: (view: PhoneView) => void
  schema: ReactNode
  preview: ReactNode
  inspector: ReactNode
}) {
  const content = { schema, preview, inspector }
  return (
    <div className="pg-phone">
      <div className="pg-phone__switch" role="group" aria-label="View">
        {VIEWS.map(({ id, label }) => (
          <button key={id} type="button" aria-pressed={view === id} onClick={() => onViewChange(id)}>
            {label}
          </button>
        ))}
      </div>
      {VIEWS.map(({ id }) => (
        <div key={id} className="pg-phone__view" hidden={view !== id}>
          <Pane id={id} visible={view === id}>
            {content[id]}
          </Pane>
        </div>
      ))}
    </div>
  )
}
```

In `App.tsx`, `const narrow = useNarrowViewport()` and `const [phoneView, setPhoneView] = useState<PhoneView>('preview')`. When `narrow`, render `PhoneWorkbench` with the same three slots, give `Toolbar` an Examples button that opens `ExampleDrawer`, and hide the Focus and Reset layout buttons. Selecting an example on a phone also switches the view to Preview.

`playground.css`:

```css
.pg-phone {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pg-phone__switch {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem;
  border-bottom: 1px solid var(--tx-border);
}

.pg-phone__switch button {
  flex: 1;
  font: inherit;
  padding: 0.35rem;
  border: 1px solid var(--tx-border);
  border-radius: var(--tx-radius);
  background: var(--tx-surface);
  color: var(--tx-text);
}

.pg-phone__switch button[aria-pressed='true'] {
  background: var(--tx-accent-soft);
  border-color: var(--tx-accent);
}

.pg-phone__view {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

@media (max-width: 799px) {
  .pg-drawer {
    inset: 0;
    width: auto;
  }
}
```

- [ ] **Step 4: Run the playground project**

Run: `pnpm vitest run --project playground`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/playground/src
git commit -m "feat(playground): phone layout with one view at a time"
```

### Task 8: Status bar

**Files:**
- Create: `apps/playground/src/workbench/StatusBar.tsx`
- Create: `apps/playground/src/workbench/dialect-label.ts`
- Modify: `apps/playground/src/App.tsx`, `apps/playground/src/playground.css`
- Test: `apps/playground/src/__tests__/status-bar.test.tsx`

**Interfaces:**
- Consumes: `AppliedSchemaState` (Task 1).
- Produces: `dialectLabel(schema: unknown): string`; `StatusBar` props `{ dialect: string; parseError: string | null; pending: boolean; schemaIssues?: number | null; cursor?: { line: number; column: number } | null; hint?: ReactNode }`. PR 2 fills `schemaIssues` and `cursor`; PR 4 fills `hint`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { App } from '../App.js'
import { dialectLabel } from '../workbench/dialect-label.js'

afterEach(cleanup)

describe('dialectLabel', () => {
  it('names the declared dialect', () => {
    expect(dialectLabel({ $schema: 'https://json-schema.org/draft/2020-12/schema' })).toBe('Draft 2020-12')
    expect(dialectLabel({ $schema: 'https://json-schema.org/draft/2019-09/schema' })).toBe('Draft 2019-09')
    expect(dialectLabel({ $schema: 'http://json-schema.org/draft-07/schema#' })).toBe('Draft 7')
    expect(dialectLabel({ $schema: 'http://json-schema.org/draft-04/schema#' })).toBe('Draft 4')
  })

  it('says draft 7 is assumed when nothing is declared, as the adapter does', () => {
    expect(dialectLabel({ type: 'object' })).toBe('Draft 7 (no $schema)')
  })
})

describe('the status bar', () => {
  it('reports the dialect and the JSON state', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    const status = screen.getByRole('contentinfo', { name: 'Status' })
    expect(status.textContent).toContain('Draft 2020-12')
    expect(status.textContent).toContain('JSON valid')
    const editor = screen.getByLabelText(/^JSON Schema/) as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: '{' } })
    expect(status.textContent).toContain('JSON error')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/status-bar.test.tsx`
Expected: FAIL, cannot resolve `dialect-label.js`.

- [ ] **Step 3: Implement**

`apps/playground/src/workbench/dialect-label.ts`:

```ts
export function dialectLabel(schema: unknown): string {
  const declared =
    typeof schema === 'object' && schema !== null ? (schema as Record<string, unknown>).$schema : undefined
  if (typeof declared === 'string') {
    if (declared.includes('2020-12')) return 'Draft 2020-12'
    if (declared.includes('2019-09')) return 'Draft 2019-09'
    if (declared.includes('draft-07')) return 'Draft 7'
    if (declared.includes('draft-04')) return 'Draft 4'
  }
  return 'Draft 7 (no $schema)'
}
```

`apps/playground/src/workbench/StatusBar.tsx`:

```tsx
import type { ReactNode } from 'react'

export function StatusBar({
  dialect,
  parseError,
  pending,
  schemaIssues = null,
  cursor = null,
  hint,
}: {
  dialect: string
  parseError: string | null
  pending: boolean
  schemaIssues?: number | null
  cursor?: { line: number; column: number } | null
  hint?: ReactNode
}) {
  return (
    <footer className="pg-status" aria-label="Status">
      <span>{dialect}</span>
      <span>{parseError ? 'JSON error' : pending ? 'Applying…' : 'JSON valid'}</span>
      {schemaIssues !== null && (
        <span>{schemaIssues === 1 ? '1 schema error' : `${schemaIssues} schema errors`}</span>
      )}
      <span className="pg-status__end">
        {cursor && `Ln ${cursor.line}, Col ${cursor.column}`}
        {hint}
      </span>
    </footer>
  )
}
```

In `App.tsx`, render `<StatusBar dialect={dialectLabel(applied?.parsed)} parseError={parseError} pending={pending} />` as the last child of `.pg-app`, reading `pending` from `useAppliedSchema`.

`playground.css`:

```css
.pg-status {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-height: 24px;
  padding: 0 0.75rem;
  font-size: 0.75rem;
  color: var(--tx-text-muted);
  border-top: 1px solid var(--tx-border);
  background: var(--tx-surface);
}

.pg-status__end {
  display: flex;
  gap: 1rem;
  margin-left: auto;
}
```

- [ ] **Step 4: Run the playground project**

Run: `pnpm vitest run --project playground`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/playground/src
git commit -m "feat(playground): status bar with dialect and JSON state"
```

### Task 9: Browser checks for the layout

**Files:**
- Modify: `vitest.config.ts` (exclude browser tests from `playground`; add `playground-browser`)
- Create: `apps/playground/src/__tests__/workbench.browser.test.tsx`

**Interfaces:**
- Consumes: the whole shell from Tasks 3 to 8.

- [ ] **Step 1: Configure the project**

In the `playground` project add `exclude: [...configDefaults.exclude, 'src/**/*.browser.test.{ts,tsx}']`, the same pattern as `web-components`. Then add, after it, a project with the same plugins and resolve settings as `playground`:

```ts
{
  plugins: [
    svelte({ configFile: resolve(root, 'packages/svelte/svelte.config.js') }),
    solid({ include: /[\\/]packages[\\/]solid[\\/].*\.tsx$/ }),
  ],
  resolve: { alias, conditions: ['development', 'browser'] },
  test: {
    name: 'playground-browser',
    root: 'apps/playground',
    include: ['src/**/*.browser.test.{ts,tsx}'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: 'chromium' }],
    },
  },
},
```

- [ ] **Step 2: Write the browser tests**

```tsx
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { page, userEvent } from '@vitest/browser/context'
import { App } from '../App.js'

const SIZES = [
  [1512, 900],
  [1024, 768],
  [390, 844],
] as const

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

function paneWidth(id: string): number {
  return document.querySelector(`[data-pane="${id}"]`)!.getBoundingClientRect().width
}

describe.each(['light', 'dark'] as const)('the workbench in %s', (theme) => {
  for (const [width, height] of SIZES) {
    it(`fits ${width}x${height} without horizontal scrolling`, async () => {
      document.documentElement.setAttribute('data-theme', theme)
      await page.viewport(width, height)
      render(<App />)
      await screen.findByLabelText(/^JSON Schema/)
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
      if (width >= 800) {
        expect(paneWidth('schema')).toBeGreaterThanOrEqual(280)
        expect(paneWidth('preview')).toBeGreaterThanOrEqual(320)
      } else {
        expect(screen.getByRole('group', { name: 'View' })).toBeTruthy()
      }
    })
  }
})

describe('the separators', () => {
  it('resize panes from the keyboard', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await screen.findByLabelText(/^JSON Schema/)
    const before = paneWidth('schema')
    screen.getByRole('separator', { name: 'Resize schema and preview' }).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(paneWidth('schema')).toBeGreaterThan(before)
  })

  it('keep form data across maximize and restore in a real browser', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement
    await userEvent.fill(name, 'Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Maximize preview' }))
    expect(paneWidth('preview')).toBeGreaterThan(1000)
    fireEvent.click(screen.getByRole('button', { name: 'Restore preview' }))
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ada')
  })
})
```

- [ ] **Step 3: Run the browser project**

Run: `pnpm vitest run --project playground-browser`
Expected: PASS, 8 tests. Playwright's Chromium comes with the root `playwright` dev dependency; install it with `pnpm exec playwright install chromium` if the runner reports it missing.

- [ ] **Step 4: Commit and open the pull request**

```bash
git add vitest.config.ts apps/playground/src/__tests__/workbench.browser.test.tsx
git commit -m "test(playground): check the workbench layout in Chromium"
```

Run `pnpm build && pnpm typecheck && pnpm test && pnpm site:build`, push, and open the pull request with "Closes #231". After merge, on the live site at 1512x900, 1024x768 and a phone: resize, maximize, Focus, collapse the inspector, reload, Reset layout.

---

## PR 2: CodeMirror editor with schema checking

Branch `feat/playground-code-editor`, from `main` after PR 1 merges.

### Task 10: `checkSchema` in `@texaryn/schema-json`

**Files:**
- Modify: `packages/schema-json/src/adapter.ts` (extract the preparation `createAdapter` runs before projection; add `checkSchema`)
- Create: `packages/schema-json/src/schema-issues.ts`
- Modify: `packages/schema-json/src/types.ts` (`SchemaIssue`)
- Modify: `packages/schema-json/src/index.ts` (export `checkSchema` and `SchemaIssue`)
- Create: `.changeset/schema-json-check-schema.md`
- Modify: `docs/api` (regenerated)
- Test: `packages/schema-json/src/__tests__/check-schema.test.ts`

**Interfaces:**
- Produces: `checkSchema(schema: unknown, config?: AdapterConfig): Promise<SchemaIssue[]>`, `interface SchemaIssue { pointer: JsonPointer; code: string; message: string }`, `resolveUnescapedPath(document: unknown, path: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { checkSchema } from '../index.js'
import { resolveUnescapedPath } from '../schema-issues.js'

const D2020 = 'https://json-schema.org/draft/2020-12/schema'

async function pointers(schema: unknown): Promise<string[]> {
  return (await checkSchema(schema)).map((issue) => issue.pointer).sort()
}

describe('checkSchema', () => {
  it('reports invalid keyword values with their pointers', async () => {
    expect(
      await pointers({
        $schema: D2020,
        type: 'object',
        properties: { name: { type: 'strin', minLength: '3' } },
        required: 'name',
      }),
    ).toEqual(['/properties/name/minLength', '/properties/name/type', '/required'])
  })

  it('checks inside 2020-12 keywords', async () => {
    expect(await pointers({ $schema: D2020, type: 'array', prefixItems: [{ type: 'strin' }] })).toEqual([
      '/prefixItems/0/type',
    ])
    expect(await pointers({ $schema: D2020, type: 'array', items: [{ type: 'string' }] })).toEqual(['/items'])
    expect(
      await pointers({ $schema: D2020, $defs: { a: { type: 'object', properties: { b: { minimum: 'x' } } } } }),
    ).toEqual(['/$defs/a/properties/b/minimum'])
  })

  it('escapes property names that contain / or ~', async () => {
    expect(
      await pointers({ $schema: D2020, type: 'object', properties: { 'a/b': { minLength: '3' }, 'c~d': { type: 'x' } } }),
    ).toEqual(['/properties/a~1b/minLength', '/properties/c~0d/type'])
  })

  it('accepts a valid schema in every dialect it detects', async () => {
    expect(
      await checkSchema({
        $schema: D2020,
        type: 'object',
        properties: { tags: { type: 'array', prefixItems: [{ type: 'string' }] } },
        $defs: { x: { type: 'number' } },
        required: ['tags'],
      }),
    ).toEqual([])
    expect(await pointers({ $schema: 'http://json-schema.org/draft-07/schema#', properties: { a: { type: 'strin' } } })).toEqual([
      '/properties/a/type',
    ])
  })

  it('gives the message without the location prefix', async () => {
    const [issue] = await checkSchema({ $schema: D2020, type: 'strin' })
    expect(issue.message).not.toMatch(/^Invalid schema found at/)
    expect(issue.message).toContain('strin')
  })

  it('rejects what createJsonSchemaAdapter rejects', async () => {
    await expect(
      checkSchema({ $schema: D2020, $defs: { a: { $ref: '#/$defs/a' } }, type: 'object', properties: { x: { $ref: '#/$defs/a' } } }),
    ).rejects.toThrow()
  })
})

describe('resolveUnescapedPath', () => {
  it('prefers the longest key that exists in the document', () => {
    const document = { properties: { 'a/b': { minLength: 1 } } }
    expect(resolveUnescapedPath(document, '/properties/a/b/minLength')).toBe('/properties/a~1b/minLength')
  })

  it('keeps unknown segments as they are', () => {
    expect(resolveUnescapedPath({}, '/missing/x')).toBe('/missing/x')
  })

  it('maps the root to the empty pointer', () => {
    expect(resolveUnescapedPath({}, '')).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project schema-json src/__tests__/check-schema.test.ts`
Expected: FAIL, `checkSchema` is not exported.

- [ ] **Step 3: Implement**

`packages/schema-json/src/schema-issues.ts`:

```ts
import type { JsonError } from '@texaryn/json-schema-library'
import type { JsonPointer } from '@texaryn/core'
import type { SchemaIssue } from './types.js'

function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

// json-schema-library joins property names into its locations without RFC 6901
// escaping, so `a/b` and nested `a` then `b` print the same. The document
// decides which keys exist; the longest existing key wins.
export function resolveUnescapedPath(document: unknown, path: string): string {
  const parts = path === '' ? [] : path.split('/').slice(1)
  const resolved: string[] = []
  let node: unknown = document
  let index = 0
  while (index < parts.length) {
    let matched = false
    if (node !== null && typeof node === 'object') {
      for (let end = parts.length; end > index; end -= 1) {
        const key = parts.slice(index, end).join('/')
        if (Object.prototype.hasOwnProperty.call(node, key)) {
          resolved.push(key)
          node = (node as Record<string, unknown>)[key]
          index = end
          matched = true
          break
        }
      }
    }
    if (!matched) {
      resolved.push(...parts.slice(index))
      break
    }
  }
  return resolved.map((segment) => `/${escapeSegment(segment)}`).join('')
}

export function toSchemaIssue(document: unknown, error: JsonError): SchemaIssue {
  const data = (error.data ?? {}) as { pointer?: unknown; message?: unknown }
  const location = typeof data.pointer === 'string' ? data.pointer.replace(/^#/, '') : ''
  return {
    pointer: resolveUnescapedPath(document, location) as JsonPointer,
    code: error.code,
    message: typeof data.message === 'string' ? data.message : error.message,
  }
}
```

In `types.ts`:

```ts
import type { JsonPointer } from '@texaryn/core'

/** A place where a schema itself is invalid, as an RFC 6901 pointer into it. */
export interface SchemaIssue {
  pointer: JsonPointer
  code: string
  message: string
}
```

In `adapter.ts`, move the first steps of `createAdapter` into one function both callers use, so the checker can never compile differently from the adapter:

```ts
async function prepareValidation(schema: unknown, config: AdapterConfig | undefined) {
  const dialect = detectDialect(schema, {
    defaultDialect: config?.defaultDialect ?? 'draft-07',
  })
  if (config?.dynamicReferenceProjection === 'local' && isPre2019Dialect(dialect)) {
    throw new TypeError('Local dynamic reference projection requires Draft 2019-09 or Draft 2020-12.')
  }
  const externalRemotes = await loadExternalResources(schema, dialect, config)
  const referenced = referencedDialects([schema, ...externalRemotes])
  const metaschemas = referenced.length > 0 ? await loadMetaschemas(referenced) : []
  const remotes = [...metaschemas, ...externalRemotes] as JsonSchema[]
  const graph = buildSchemaGraph(schema, dialect, remotes)
  rejectSameLocationCycles(graph)
  const validated = await prepareSchema(schema, dialect, remotes)
  return { dialect, externalRemotes, metaschemas, remotes, graph, validated }
}

export async function checkSchema(schema: unknown, config?: AdapterConfig): Promise<SchemaIssue[]> {
  const { validated } = await prepareValidation(schema, config)
  return validated.schemaErrors.map((error) => toSchemaIssue(schema, error))
}
```

`createAdapter` then starts with `const { dialect, externalRemotes, metaschemas, remotes, graph, validated } = await prepareValidation(schema, config)` and drops its own copies of those lines, its `rejectSameLocationCycles(graph)` call and its `const validated = …` line. Everything after stays as it is. Keep the two existing comments ("json-schema-library carries no metaschema documents…" and "json-schema-library evaluates some branches…") with the code they describe.

`index.ts` adds:

```ts
export { createJsonSchemaAdapter, checkSchema } from './adapter.js'
export type { AdapterConfig, SchemaIssue } from './types.js'
```

`.changeset/schema-json-check-schema.md`:

```md
---
'@texaryn/schema-json': minor
---

Adds `checkSchema`, which reports where a schema itself is invalid. It runs the same preparation as `createJsonSchemaAdapter` and returns RFC 6901 pointers into the schema, escaping property names that contain `/` or `~`.
```

- [ ] **Step 4: Run the schema-json suite**

Run: `pnpm vitest run --project schema-json`
Expected: PASS, all existing tests plus 9 new ones. A changed existing result means the extraction altered the adapter; fix that before going on.

- [ ] **Step 5: Regenerate the API docs**

Run: `pnpm build && pnpm docs`
Expected: `docs/api` gains `checkSchema` and `SchemaIssue`.

- [ ] **Step 6: Commit**

```bash
git add packages/schema-json .changeset/schema-json-check-schema.md docs/api
git commit -m "feat(schema-json): add checkSchema for locating invalid schema keywords"
```

### Task 11: From a pointer to a place in the editor

**Files:**
- Modify: `apps/playground/package.json` (`pnpm --filter @texaryn/playground add -E @codemirror/state @codemirror/view @codemirror/language @codemirror/commands @codemirror/search @codemirror/autocomplete @codemirror/lint @codemirror/lang-json @lezer/common @lezer/highlight @lezer/json`)
- Create: `apps/playground/src/editor/pointer-range.ts`
- Test: `apps/playground/src/__tests__/pointer-range.test.ts`

**Interfaces:**
- Produces: `interface TextRange { from: number; to: number }`, `rangeForPointer(tree: Tree, doc: string, pointer: string): TextRange`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { parser } from '@lezer/json'
import { rangeForPointer } from '../editor/pointer-range.js'

const doc = JSON.stringify(
  {
    type: 'object',
    properties: { name: { type: 'strin' }, 'a/b': { minLength: '3' } },
    prefixItems: [{ type: 'strin' }],
    items: [{ type: 'string' }],
  },
  null,
  2,
)
const tree = parser.parse(doc)

function textAt(pointer: string): string {
  const { from, to } = rangeForPointer(tree, doc, pointer)
  return doc.slice(from, to)
}

describe('rangeForPointer', () => {
  it('finds a nested value', () => {
    expect(textAt('/properties/name/type')).toBe('"strin"')
  })

  it('unescapes ~1 in property names', () => {
    expect(textAt('/properties/a~1b/minLength')).toBe('"3"')
  })

  it('walks array elements by index', () => {
    expect(textAt('/prefixItems/0/type')).toBe('"strin"')
  })

  it('marks only the first line of a container', () => {
    expect(textAt('/items')).toBe('[')
  })

  it('falls back to the deepest node it found', () => {
    expect(textAt('/properties/missing/type').startsWith('{')).toBe(true)
  })

  it('marks the first line of the root for the empty pointer', () => {
    expect(textAt('')).toBe('{')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/pointer-range.test.ts`
Expected: FAIL, cannot resolve `../editor/pointer-range.js`.

- [ ] **Step 3: Implement `apps/playground/src/editor/pointer-range.ts`**

```ts
import type { SyntaxNode, Tree } from '@lezer/common'

export interface TextRange {
  from: number
  to: number
}

function unescapeSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

function readName(doc: string, node: SyntaxNode): string | null {
  try {
    return JSON.parse(doc.slice(node.from, node.to)) as string
  } catch {
    return null
  }
}

function childValue(doc: string, node: SyntaxNode, segment: string): SyntaxNode | null {
  if (node.name === 'Object') {
    for (let property = node.firstChild; property; property = property.nextSibling) {
      if (property.name !== 'Property') continue
      const name = property.getChild('PropertyName')
      const value = property.lastChild
      if (name && value && value !== name && readName(doc, name) === segment) return value
    }
    return null
  }
  if (node.name === 'Array') {
    const index = Number(segment)
    if (!Number.isInteger(index) || index < 0) return null
    let seen = 0
    for (let item = node.firstChild; item; item = item.nextSibling) {
      if (item.name === '[' || item.name === ']' || item.name === ',' || item.type.isError) continue
      if (seen === index) return item
      seen += 1
    }
  }
  return null
}

export function rangeForPointer(tree: Tree, doc: string, pointer: string): TextRange {
  let node = tree.topNode.firstChild
  if (!node) return { from: 0, to: 0 }
  const segments = pointer === '' ? [] : pointer.split('/').slice(1).map(unescapeSegment)
  for (const segment of segments) {
    const next = childValue(doc, node, segment)
    if (!next) break
    node = next
  }
  if (node.name === 'Object' || node.name === 'Array') {
    const lineEnd = doc.indexOf('\n', node.from)
    return { from: node.from, to: lineEnd === -1 ? node.to : Math.min(node.to, lineEnd) }
  }
  return { from: node.from, to: node.to }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run --project playground src/__tests__/pointer-range.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/playground/package.json pnpm-lock.yaml apps/playground/src/editor/pointer-range.ts apps/playground/src/__tests__/pointer-range.test.ts
git commit -m "feat(playground): map schema pointers to editor ranges"
```

### Task 12: Keyword autocomplete

**Files:**
- Create: `apps/playground/src/editor/keywords.ts`
- Create: `apps/playground/src/editor/completion.ts`
- Test: `apps/playground/src/__tests__/completion.test.ts`

**Interfaces:**
- Produces: `type EditorDialect = 'draft-04' | 'draft-07' | '2019-09' | '2020-12'`, `interface KeywordInfo { name: string; detail: string }`, `keywordsFor(dialect: EditorDialect): readonly KeywordInfo[]`, `dialectOf(text: string): EditorDialect`, `TYPE_VALUES`, `SCHEMA_URIS`, `FORMATS`, `NAME_MAPS`, `schemaCompletionSource(context: CompletionContext): CompletionResult | null`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import type { CompletionResult } from '@codemirror/autocomplete'
import { ensureSyntaxTree } from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { schemaCompletionSource } from '../editor/completion.js'

function complete(doc: string, pos = doc.length): CompletionResult | null {
  const state = EditorState.create({ doc, extensions: [json()] })
  ensureSyntaxTree(state, state.doc.length, 1000)
  return schemaCompletionSource(new CompletionContext(state, pos, false))
}

function labels(result: CompletionResult | null): string[] {
  return (result?.options ?? []).map((option) => option.displayLabel ?? option.label)
}

describe('schemaCompletionSource', () => {
  it('offers draft 7 keywords when no $schema is declared', () => {
    const names = labels(complete('{\n  "type": "object",\n  "max'))
    expect(names).toContain('maxLength')
    expect(names).not.toContain('prefixItems')
  })

  it('follows the declared dialect', () => {
    const names = labels(complete('{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "pre'))
    expect(names).toContain('prefixItems')
    expect(names).toContain('$defs')
    expect(names).not.toContain('definitions')
  })

  it('offers nothing where keys are property names', () => {
    expect(complete('{\n  "properties": {\n    "na')).toBeNull()
  })

  it('offers type names as values of type', () => {
    expect(labels(complete('{ "type": "str'))).toContain('string')
  })

  it('replaces an auto-closed quote', () => {
    const doc = '{ "max" }'
    const result = complete(doc, doc.indexOf('"max') + 4)
    expect(result?.to).toBe(doc.indexOf('"max') + 5)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/completion.test.ts`
Expected: FAIL, cannot resolve `../editor/completion.js`.

- [ ] **Step 3: Implement**

`apps/playground/src/editor/keywords.ts`:

```ts
export type EditorDialect = 'draft-04' | 'draft-07' | '2019-09' | '2020-12'

export interface KeywordInfo {
  name: string
  detail: string
}

const k = (name: string, detail: string): KeywordInfo => ({ name, detail })

const SHARED: readonly KeywordInfo[] = [
  k('$schema', 'dialect URI'),
  k('$ref', 'reference'),
  k('title', 'string'),
  k('description', 'string'),
  k('default', 'any value'),
  k('type', 'type name or list'),
  k('enum', 'array of values'),
  k('properties', 'object of schemas'),
  k('patternProperties', 'object of schemas'),
  k('additionalProperties', 'schema'),
  k('required', 'array of names'),
  k('minProperties', 'integer ≥ 0'),
  k('maxProperties', 'integer ≥ 0'),
  k('items', 'schema'),
  k('minItems', 'integer ≥ 0'),
  k('maxItems', 'integer ≥ 0'),
  k('uniqueItems', 'boolean'),
  k('minLength', 'integer ≥ 0'),
  k('maxLength', 'integer ≥ 0'),
  k('pattern', 'regular expression'),
  k('format', 'format name'),
  k('minimum', 'number'),
  k('maximum', 'number'),
  k('multipleOf', 'number > 0'),
  k('allOf', 'array of schemas'),
  k('anyOf', 'array of schemas'),
  k('oneOf', 'array of schemas'),
  k('not', 'schema'),
]

const DRAFT_04: readonly KeywordInfo[] = [
  ...SHARED,
  k('id', 'base URI'),
  k('definitions', 'object of schemas'),
  k('dependencies', 'object'),
  k('additionalItems', 'schema'),
  k('exclusiveMinimum', 'boolean'),
  k('exclusiveMaximum', 'boolean'),
]

const SINCE_07: readonly KeywordInfo[] = [
  k('$id', 'base URI'),
  k('$comment', 'string'),
  k('const', 'any value'),
  k('contains', 'schema'),
  k('examples', 'array of values'),
  k('propertyNames', 'schema'),
  k('if', 'schema'),
  k('then', 'schema'),
  k('else', 'schema'),
  k('readOnly', 'boolean'),
  k('writeOnly', 'boolean'),
  k('contentMediaType', 'media type'),
  k('contentEncoding', 'encoding'),
  k('exclusiveMinimum', 'number'),
  k('exclusiveMaximum', 'number'),
]

const DRAFT_07: readonly KeywordInfo[] = [
  ...SHARED,
  ...SINCE_07,
  k('definitions', 'object of schemas'),
  k('dependencies', 'object'),
  k('additionalItems', 'schema'),
]

const SINCE_2019: readonly KeywordInfo[] = [
  ...SHARED,
  ...SINCE_07,
  k('$anchor', 'name'),
  k('$defs', 'object of schemas'),
  k('$vocabulary', 'object'),
  k('minContains', 'integer ≥ 0'),
  k('maxContains', 'integer ≥ 0'),
  k('deprecated', 'boolean'),
  k('dependentRequired', 'object of name lists'),
  k('dependentSchemas', 'object of schemas'),
  k('unevaluatedItems', 'schema'),
  k('unevaluatedProperties', 'schema'),
  k('contentSchema', 'schema'),
]

const DRAFT_2019: readonly KeywordInfo[] = [
  ...SINCE_2019,
  k('$recursiveRef', 'reference'),
  k('$recursiveAnchor', 'boolean'),
  k('additionalItems', 'schema'),
]

const DRAFT_2020: readonly KeywordInfo[] = [
  ...SINCE_2019,
  k('$dynamicRef', 'reference'),
  k('$dynamicAnchor', 'name'),
  k('prefixItems', 'array of schemas'),
]

const BY_DIALECT: Record<EditorDialect, readonly KeywordInfo[]> = {
  'draft-04': DRAFT_04,
  'draft-07': DRAFT_07,
  '2019-09': DRAFT_2019,
  '2020-12': DRAFT_2020,
}

export function keywordsFor(dialect: EditorDialect): readonly KeywordInfo[] {
  return BY_DIALECT[dialect]
}

// The adapter assumes draft-07 when a schema declares no $schema.
export function dialectOf(text: string): EditorDialect {
  const declared = /"\$schema"\s*:\s*"([^"]*)"/.exec(text)?.[1] ?? ''
  if (declared.includes('2020-12')) return '2020-12'
  if (declared.includes('2019-09')) return '2019-09'
  if (declared.includes('draft-04')) return 'draft-04'
  return 'draft-07'
}

export const TYPE_VALUES = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'] as const

export const SCHEMA_URIS = [
  'https://json-schema.org/draft/2020-12/schema',
  'https://json-schema.org/draft/2019-09/schema',
  'http://json-schema.org/draft-07/schema#',
  'http://json-schema.org/draft-04/schema#',
] as const

export const FORMATS = [
  'date-time', 'date', 'time', 'duration', 'email', 'idn-email', 'hostname', 'idn-hostname',
  'ipv4', 'ipv6', 'uri', 'uri-reference', 'iri', 'iri-reference', 'uuid', 'uri-template',
  'json-pointer', 'relative-json-pointer', 'regex',
] as const

export const NAME_MAPS: ReadonlySet<string> = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
])
```

`apps/playground/src/editor/completion.ts`:

```ts
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { FORMATS, NAME_MAPS, SCHEMA_URIS, TYPE_VALUES, dialectOf, keywordsFor } from './keywords.js'

const TYPING = /^"[^"\\]*$/

function enclosingKey(context: CompletionContext, pos: number): string | null {
  let node: SyntaxNode | null = syntaxTree(context.state).resolveInner(pos, -1)
  while (node && node.name !== 'Object') node = node.parent
  const property = node?.parent
  if (!property || property.name !== 'Property') return null
  const name = property.getChild('PropertyName')
  if (!name) return null
  try {
    return JSON.parse(context.state.doc.sliceString(name.from, name.to)) as string
  } catch {
    return null
  }
}

export function schemaCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/"[^"\\]*$/)
  if (!word && !context.explicit) return null
  const from = word ? word.from : context.pos
  const to = context.state.doc.sliceString(context.pos, context.pos + 1) === '"' ? context.pos + 1 : context.pos
  const before = context.state.doc.sliceString(0, from).trimEnd()
  const last = before.at(-1)

  if (last === '{' || last === ',') {
    const parent = enclosingKey(context, from)
    if (parent !== null && NAME_MAPS.has(parent)) return null
    const dialect = dialectOf(context.state.doc.toString())
    return {
      from,
      to,
      validFor: TYPING,
      options: keywordsFor(dialect).map((keyword) => ({
        label: `"${keyword.name}"`,
        displayLabel: keyword.name,
        detail: keyword.detail,
        type: 'property',
        apply: `"${keyword.name}": `,
      })),
    }
  }

  if (last === ':') {
    const key = /"((?:[^"\\]|\\.)*)"\s*$/.exec(before.slice(0, -1))?.[1]
    const values = key === 'type' ? TYPE_VALUES : key === '$schema' ? SCHEMA_URIS : key === 'format' ? FORMATS : null
    if (!values) return null
    return {
      from,
      to,
      validFor: TYPING,
      options: values.map((value) => ({ label: `"${value}"`, displayLabel: value, type: 'constant' })),
    }
  }

  return null
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run --project playground src/__tests__/completion.test.ts`
Expected: PASS, 5 tests. If the "property names" case completes inside `properties`, print `syntaxTree(state).resolveInner(pos, -1)` and its parents for that document and adjust `enclosingKey` to the node the parser actually recovers; do not loosen the test.

- [ ] **Step 5: Commit**

```bash
git add apps/playground/src/editor/keywords.ts apps/playground/src/editor/completion.ts apps/playground/src/__tests__/completion.test.ts
git commit -m "feat(playground): complete JSON Schema keywords for the declared dialect"
```

### Task 13: The CodeMirror schema editor

**Files:**
- Create: `apps/playground/src/editor/theme.ts`
- Create: `apps/playground/src/editor/schema-lint.ts`
- Create: `apps/playground/src/editor/SchemaEditor.tsx` (default export, the lazy chunk)
- Create: `apps/playground/src/editor-slot.tsx` (in the main bundle)
- Create: `apps/playground/src/__tests__/schema-text.ts` (test helpers)
- Modify: `apps/playground/src/App.tsx` (use `SchemaEditorSlot`; Format and Copy; feed the status bar)
- Modify: `apps/playground/src/playground.css` (`--tx-code-*` tokens and `.pg-code-editor`)
- Modify: `apps/playground/src/test-setup.ts` (`Range` geometry stubs)
- Modify: `apps/playground/src/__tests__/inspector.test.tsx`, `form-builder.test.tsx`, `schema-edit-lifecycle.test.tsx`, `workspace.test.tsx`, `status-bar.test.tsx` (use the helpers)
- Modify: `apps/playground/src/__tests__/workbench.browser.test.tsx` (underline and Tab)
- Test: `apps/playground/src/__tests__/schema-editor.test.tsx`

**Interfaces:**
- Consumes: `checkSchema` (Task 10), `rangeForPointer` (Task 11), `schemaCompletionSource` (Task 12), `StatusBar` props `schemaIssues` and `cursor` (Task 8).
- Produces: `interface SchemaEditorProps { value: string; onChange: (text: string) => void; labelledBy: string; onSchemaIssues?: (count: number | null) => void; onCursor?: (cursor: { line: number; column: number } | null) => void }`, `SchemaEditorSlot(props: SchemaEditorProps)`, test helpers `readSchemaText(): string` and `editSchema(text: string): void`.

- [ ] **Step 1: Add the `Range` stubs to `test-setup.ts`**

CodeMirror measures text through `Range.prototype.getClientRects`, which jsdom 25 lacks (checked 2026-10-12).

```ts
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function getClientRects(): DOMRectList {
    return { length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] } as unknown as DOMRectList
  }
  Range.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    return new DOMRect()
  }
}
```

- [ ] **Step 2: Add the test helpers**

`apps/playground/src/__tests__/schema-text.ts`:

```ts
import { fireEvent, screen } from '@testing-library/react'
import { EditorView } from '@codemirror/view'

function editorElement(): HTMLElement {
  return screen.getByLabelText(/^JSON Schema/)
}

function viewFor(element: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(element.closest<HTMLElement>('.cm-editor') ?? element)
  if (!view) throw new Error('the JSON Schema label points at neither a textarea nor an editor')
  return view
}

export function readSchemaText(): string {
  const element = editorElement()
  return element instanceof HTMLTextAreaElement ? element.value : viewFor(element).state.doc.toString()
}

export function editSchema(text: string): void {
  const element = editorElement()
  if (element instanceof HTMLTextAreaElement) {
    fireEvent.change(element, { target: { value: text } })
    return
  }
  const view = viewFor(element)
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
}
```

Replace every `getByLabelText(/^JSON Schema/) as HTMLTextAreaElement` plus `.value` or `fireEvent.change` in the five test files listed above with `readSchemaText()` and `editSchema(text)`. In `schema-edit-lifecycle.test.tsx`, rename its local `editSchema(update)` to `updateSchema(update)` and rebuild it on the helpers:

```ts
function updateSchema(update: (schema: Record<string, unknown>) => void): void {
  const schema = JSON.parse(readSchemaText()) as Record<string, unknown>
  update(schema)
  editSchema(JSON.stringify(schema, null, 2))
}
```

- [ ] **Step 3: Write the failing tests**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { forEachDiagnostic } from '@codemirror/lint'
import { App } from '../App.js'
import { editSchema, readSchemaText } from './schema-text.js'

afterEach(cleanup)

function view(): EditorView {
  const element = document.querySelector<HTMLElement>('.cm-editor')
  if (!element) throw new Error('no CodeMirror editor')
  return EditorView.findFromDOM(element)!
}

function diagnostics(): { text: string; message: string }[] {
  const found: { text: string; message: string }[] = []
  forEachDiagnostic(view().state, (diagnostic, from, to) => {
    found.push({ text: view().state.doc.sliceString(from, to), message: diagnostic.message })
  })
  return found
}

async function openStringField(): Promise<void> {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
  await waitFor(() => expect(document.querySelector('.cm-editor')).toBeTruthy())
}

describe('the schema editor', () => {
  it('shows the example schema under the JSON Schema label', async () => {
    await openStringField()
    expect(readSchemaText()).toContain('"title": "String field"')
  })

  it('underlines an invalid keyword value', async () => {
    await openStringField()
    editSchema(readSchemaText().replace('"type": "string"', '"type": "strin"'))
    await waitFor(() => expect(diagnostics().map((entry) => entry.text)).toContain('"strin"'), { timeout: 3000 })
  })

  it('reports a rejected schema at the start instead of failing', async () => {
    await openStringField()
    const schema = JSON.parse(readSchemaText()) as Record<string, unknown>
    schema.$defs = { loop: { $ref: '#/$defs/loop' } }
    ;(schema.properties as Record<string, unknown>).loop = { $ref: '#/$defs/loop' }
    editSchema(JSON.stringify(schema, null, 2))
    await waitFor(() => expect(diagnostics().some((entry) => /itself/.test(entry.message))).toBe(true), {
      timeout: 3000,
    })
  })

  it('counts schema errors in the status bar', async () => {
    await openStringField()
    editSchema(readSchemaText().replace('"type": "string"', '"type": "strin"'))
    await waitFor(
      () => expect(screen.getByRole('contentinfo', { name: 'Status' }).textContent).toContain('1 schema error'),
      { timeout: 3000 },
    )
  })

  it('formats the schema', async () => {
    await openStringField()
    editSchema(JSON.stringify(JSON.parse(readSchemaText())))
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    expect(readSchemaText()).toContain('\n  "type"')
  })
})
```

- [ ] **Step 4: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/schema-editor.test.tsx`
Expected: FAIL, no `.cm-editor`.

- [ ] **Step 5: Implement**

`apps/playground/src/editor/theme.ts`:

```ts
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--tx-code-bg)', color: 'var(--tx-text)', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'var(--tx-font-mono)', lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: 'var(--tx-code-bg)', color: 'var(--tx-code-gutter)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--tx-code-active-line)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--tx-code-selection)' },
  '&.cm-focused': { outline: '2px solid var(--tx-accent)', outlineOffset: '-2px' },
  '.cm-tooltip': {
    backgroundColor: 'var(--tx-surface-raised)',
    border: '1px solid var(--tx-border-strong)',
    color: 'var(--tx-text)',
  },
})

export const editorHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.propertyName, color: 'var(--tx-code-key)' },
    { tag: tags.string, color: 'var(--tx-code-string)' },
    { tag: tags.number, color: 'var(--tx-code-number)' },
    { tag: [tags.bool, tags.null], color: 'var(--tx-code-keyword)' },
    { tag: [tags.brace, tags.squareBracket, tags.separator], color: 'var(--tx-text-muted)' },
  ]),
)
```

`apps/playground/src/editor/schema-lint.ts`:

```ts
import type { Diagnostic } from '@codemirror/lint'
import type { EditorView } from '@codemirror/view'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { checkSchema } from '@texaryn/schema-json'
import { rangeForPointer } from './pointer-range.js'

export function schemaLintSource(onCount: (count: number | null) => void) {
  return async (view: EditorView): Promise<Diagnostic[]> => {
    const text = view.state.doc.toString()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      onCount(null)
      return []
    }
    const tree = ensureSyntaxTree(view.state, view.state.doc.length, 200) ?? syntaxTree(view.state)
    try {
      const issues = await checkSchema(parsed)
      onCount(issues.length)
      return issues.map((issue) => ({
        ...rangeForPointer(tree, text, issue.pointer),
        severity: 'error' as const,
        message: issue.message,
        source: 'JSON Schema',
      }))
    } catch (error) {
      onCount(1)
      return [
        {
          from: 0,
          to: Math.min(1, text.length),
          severity: 'error' as const,
          message: error instanceof Error ? error.message : String(error),
          source: 'Texaryn',
        },
      ]
    }
  }
}
```

`apps/playground/src/editor/SchemaEditor.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { linter, lintGutter, lintKeymap } from '@codemirror/lint'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { editorHighlight, editorTheme } from './theme.js'
import { schemaLintSource } from './schema-lint.js'
import { schemaCompletionSource } from './completion.js'

export interface SchemaEditorProps {
  value: string
  onChange: (text: string) => void
  labelledBy: string
  onSchemaIssues?: (count: number | null) => void
  onCursor?: (cursor: { line: number; column: number } | null) => void
}

export default function SchemaEditor({ value, onChange, labelledBy, onSchemaIssues, onCursor }: SchemaEditorProps) {
  const host = useRef<HTMLDivElement | null>(null)
  const view = useRef<EditorView | null>(null)
  const extensions = useRef<Extension[]>([])
  const callbacks = useRef({ onChange, onSchemaIssues, onCursor })
  callbacks.current = { onChange, onSchemaIssues, onCursor }

  useEffect(() => {
    extensions.current = [
      lineNumbers(),
      foldGutter(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      history(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightSelectionMatches(),
      json(),
      editorTheme,
      editorHighlight,
      linter(jsonParseLinter()),
      linter(schemaLintSource((count) => callbacks.current.onSchemaIssues?.(count)), { delay: 300 }),
      lintGutter(),
      autocompletion({ override: [schemaCompletionSource] }),
      // No indentWithTab: Tab has to leave the editor for keyboard users.
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
      EditorView.contentAttributes.of({ 'aria-labelledby': labelledBy }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
        if (update.selectionSet || update.focusChanged) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          callbacks.current.onCursor?.(update.view.hasFocus ? { line: line.number, column: head - line.from + 1 } : null)
        }
      }),
    ]
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({ doc: value, extensions: extensions.current }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [labelledBy])

  // Text replaced from outside (another example, the visual builder, Format)
  // starts a fresh history, so undo never crosses into a different document.
  useEffect(() => {
    const editor = view.current
    if (!editor || editor.state.doc.toString() === value) return
    editor.setState(EditorState.create({ doc: value, extensions: extensions.current }))
  }, [value])

  return <div ref={host} className="pg-code-editor" />
}
```

`apps/playground/src/editor-slot.tsx`:

```tsx
import { Component, Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import type { SchemaEditorProps } from './editor/SchemaEditor.js'

const SchemaEditor = lazy(() => import('./editor/SchemaEditor.js'))

function PlainEditor({ value, onChange, labelledBy }: SchemaEditorProps) {
  return (
    <textarea
      aria-labelledby={labelledBy}
      className="pg-schema-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      wrap="off"
    />
  )
}

class EditorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

// The textarea stays until the editor chunk arrives, and for good if it fails.
export function SchemaEditorSlot(props: SchemaEditorProps) {
  const plain = <PlainEditor {...props} />
  return (
    <EditorBoundary fallback={plain}>
      <Suspense fallback={plain}>
        <SchemaEditor {...props} />
      </Suspense>
    </EditorBoundary>
  )
}
```

In `App.tsx`: render `<SchemaEditorSlot value={schemaText} onChange={handleSchemaChange} labelledBy="schema-editor-label" onSchemaIssues={setSchemaIssues} onCursor={setCursor} />` where the textarea was; add `schemaIssues` and `cursor` state and pass them to `StatusBar`; add header buttons to the schema pane:

```tsx
{parseError === null && (
  <button
    type="button"
    className="pg-pane__action"
    onClick={() => handleSchemaChange(JSON.stringify(JSON.parse(schemaText), null, 2))}
  >
    Format
  </button>
)}
<button type="button" className="pg-pane__action" onClick={() => void navigator.clipboard?.writeText(schemaText)}>
  Copy
</button>
```

`playground.css`, in the `:root` block:

```css
  --tx-code-bg: #ffffff;
  --tx-code-gutter: #237893;
  --tx-code-key: #0070c1;
  --tx-code-string: #a31515;
  --tx-code-number: #098658;
  --tx-code-keyword: #0000ff;
  --tx-code-selection: #add6ff;
  --tx-code-active-line: #99999926;
```

in the `:root[data-theme='dark']` block:

```css
  --tx-code-bg: #1e1e1e;
  --tx-code-gutter: #838383;
  --tx-code-key: #9cdcfe;
  --tx-code-string: #ce9178;
  --tx-code-number: #b5cea8;
  --tx-code-keyword: #569cd6;
  --tx-code-selection: #6199ff2f;
  --tx-code-active-line: #ffffff0f;
```

and after `.pg-schema-editor`:

```css
.pg-code-editor {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
```

- [ ] **Step 6: Add the browser checks to `workbench.browser.test.tsx`**

```tsx
describe('the schema editor in Chromium', () => {
  it('draws an underline under an invalid keyword value', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    await waitFor(() => expect(document.querySelector('.cm-editor')).toBeTruthy())
    editSchema(readSchemaText().replace('"type": "string"', '"type": "strin"'))
    await waitFor(
      () => expect(document.querySelector('.cm-lintRange-error')?.textContent).toBe('"strin"'),
      { timeout: 3000 },
    )
  })

  it('lets Tab leave the editor', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await waitFor(() => expect(document.querySelector('.cm-content')).toBeTruthy())
    document.querySelector<HTMLElement>('.cm-content')!.focus()
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement?.closest('.cm-editor')).toBeNull()
  })
})
```

with `waitFor` added to the `@testing-library/react` import and `editSchema`, `readSchemaText` imported from `./schema-text.js`.

- [ ] **Step 7: Run both playground projects**

Run: `pnpm vitest run --project playground && pnpm vitest run --project playground-browser`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/playground/src
git commit -m "feat(playground): CodeMirror schema editor checked by checkSchema"
```

### Task 14: Size limits

**Files:**
- Modify: `apps/playground/vite.config.ts` (`manualChunks`)
- Create: `scripts/check-playground-size.mjs`
- Test: `scripts/check-playground-size.test.mjs`
- Modify: `package.json` (`site:build`)

**Interfaces:**
- Produces: `LIMITS`, `gzipSize(source: Buffer | string): number`, `initialScripts(html: string): string[]`, `measure({ html, assets, read }): { initial: number; editor: number; palette: number }`, `overLimit(sizes, limits?): string[]`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { initialScripts, measure, overLimit, LIMITS } from './check-playground-size.mjs'

const HTML = `<!doctype html><head>
<script type="module" crossorigin src="/texaryn/playground/assets/index-abc.js"></script>
<link rel="modulepreload" crossorigin href="/texaryn/playground/assets/vendor-def.js">
</head>`

describe('check-playground-size', () => {
  it('finds the entry script and its preloads', () => {
    expect(initialScripts(HTML)).toEqual([
      '/texaryn/playground/assets/index-abc.js',
      '/texaryn/playground/assets/vendor-def.js',
    ])
  })

  it('sums gzip sizes per group', () => {
    const files = {
      'index-abc.js': 'a'.repeat(1000),
      'vendor-def.js': 'b'.repeat(1000),
      'editor-1.js': 'c'.repeat(1000),
      'palette-2.js': 'd'.repeat(1000),
      'other-3.js': 'e'.repeat(1000),
    }
    const sizes = measure({ html: HTML, assets: Object.keys(files), read: (name) => files[name] })
    expect(sizes.initial).toBeGreaterThan(0)
    expect(sizes.editor).toBeGreaterThan(0)
    expect(sizes.palette).toBeGreaterThan(0)
  })

  it('names every group over its limit', () => {
    expect(overLimit({ initial: LIMITS.initial + 1, editor: 0, palette: LIMITS.palette + 1 })).toEqual([
      'initial',
      'palette',
    ])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --project scripts check-playground-size`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `scripts/check-playground-size.mjs`**

```js
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

export const LIMITS = { initial: 320 * 1024, editor: 150 * 1024, palette: 25 * 1024 }

export function gzipSize(source) {
  return gzipSync(source, { level: 9 }).length
}

export function initialScripts(html) {
  const found = new Set()
  for (const match of html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) found.add(match[1])
  for (const match of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) found.add(match[1])
  return [...found]
}

export function measure({ html, assets, read }) {
  const sum = (names) => names.reduce((total, name) => total + gzipSize(read(name)), 0)
  return {
    initial: sum(initialScripts(html).map((src) => src.split('/').pop())),
    editor: sum(assets.filter((name) => /^editor-.*\.js$/.test(name))),
    palette: sum(assets.filter((name) => /^palette-.*\.js$/.test(name))),
  }
}

export function overLimit(sizes, limits = LIMITS) {
  return Object.keys(limits).filter((key) => sizes[key] > limits[key])
}

function main(dist) {
  const root = resolve(dist)
  const assetsDir = join(root, 'assets')
  const sizes = measure({
    html: readFileSync(join(root, 'index.html'), 'utf8'),
    assets: readdirSync(assetsDir).filter((name) => name.endsWith('.js')),
    read: (name) => readFileSync(join(assetsDir, name)),
  })
  for (const key of Object.keys(LIMITS)) {
    console.log(`${key}: ${(sizes[key] / 1024).toFixed(1)} KB gzipped, limit ${LIMITS[key] / 1024} KB`)
  }
  const over = overLimit(sizes)
  if (over.length > 0) {
    console.error(`check-playground-size: over the limit: ${over.join(', ')}`)
    process.exit(1)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv[2] ?? 'apps/playground/dist')
```

- [ ] **Step 4: Name the lazy chunks in `apps/playground/vite.config.ts`**

Add to the returned config:

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks(id: string) {
        const file = id.replaceAll('\\', '/')
        if (/\/node_modules\/(@codemirror|@lezer|crelt|style-mod|w3c-keyname)\//.test(file) || file.includes('/apps/playground/src/editor/')) {
          return 'editor'
        }
        if (/\/node_modules\/(cmdk|@radix-ui)\//.test(file) || file.includes('/apps/playground/src/palette/')) {
          return 'palette'
        }
        return undefined
      },
    },
  },
},
```

- [ ] **Step 5: Wire it into `site:build`**

In the root `package.json`, insert `&& node scripts/check-playground-size.mjs apps/playground/dist` directly after `pnpm --filter @texaryn/playground build:pages`.

- [ ] **Step 6: Run the test and the real check**

Run: `pnpm vitest run --project scripts check-playground-size && pnpm build && pnpm --filter @texaryn/playground build:pages && node scripts/check-playground-size.mjs apps/playground/dist`
Expected: tests PASS; the check prints three sizes under their limits and exits 0. Record the three numbers in the pull request description.

- [ ] **Step 7: Commit and open the pull request**

```bash
git add apps/playground/vite.config.ts scripts/check-playground-size.mjs scripts/check-playground-size.test.mjs package.json
git commit -m "build(playground): enforce first-load and lazy chunk size limits"
```

Run `pnpm build && pnpm typecheck && pnpm test && pnpm site:build && pnpm docs:check`, push, and open the pull request. After merge, on the live site: plant `"type": "strin"` and see the underline, use autocomplete, switch the theme, and type in the editor on a phone.

---

## PR 3: Width presets and data presets

Branch `feat/playground-presets`, from `main` after PR 2 merges.

### Task 15: Presets in the examples contract

**Files:**
- Modify: `packages/examples/src/types.ts` (`ExamplePreset`, `TexarynExample.presets`)
- Modify: `packages/examples/src/index.ts` (export the type)
- Modify: `packages/examples/src/basics/enums-and-required.ts`, `packages/examples/src/validation/constraints.ts`, `packages/examples/src/composition/conditionals.ts`, `packages/examples/src/composition/one-of.ts`, `packages/examples/src/composition/any-of.ts`, `packages/examples/src/runtime/index.ts`
- Test: `packages/examples/src/__tests__/examples-run.test.ts`

**Interfaces:**
- Produces: `interface ExamplePreset { id: string; label: string; data: unknown; invalid?: true }`, `TexarynExample.presets?: readonly ExamplePreset[]`.

- [ ] **Step 1: Write the failing tests**

Inside the existing `describe.each` in `examples-run.test.ts`:

```ts
it('declares presets whose validity matches the declaration', async () => {
  if (!example.presets) return
  const port = await createJsonSchemaAdapter(example.schema, { defaultDialect: example.dialect })
  const ids = new Set<string>()
  for (const preset of example.presets) {
    expect(ids.has(preset.id), `${example.id} repeats preset id ${preset.id}`).toBe(false)
    ids.add(preset.id)
    const result = await port.validate(preset.data)
    if (preset.invalid) {
      expect(result.errors.length, `${example.id} preset ${preset.id} is marked invalid but passes`).toBeGreaterThan(0)
    } else {
      expect(result.errors, `${example.id} preset ${preset.id} violates its schema`).toEqual([])
    }
  }
})
```

and after it:

```ts
describe('presets', () => {
  it('exist for the examples where form states matter', () => {
    const ids = [
      'basics-required',
      'validation-string-constraints',
      'validation-numeric-constraints',
      'validation-exclusive-numeric-constraints',
      'validation-array-constraints',
      'conditional-if-then-else',
      'composition-one-of',
      'composition-any-of',
      'runtime-array-interactions',
      'runtime-validation-triggers',
      'runtime-submission',
    ]
    for (const id of ids) {
      expect(examples.find((example) => example.id === id)?.presets?.length, id).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project examples`
Expected: the `presets` test FAILS for every listed id.

- [ ] **Step 3: Implement**

In `types.ts`:

```ts
export interface ExamplePreset {
  id: string
  label: string
  data: unknown
  /** Set when the preset deliberately violates the example's schema. */
  invalid?: true
}
```

and in `TexarynExample`, after `initialData`:

```ts
  /** Named data states the playground offers in addition to `initialData`. */
  presets?: readonly ExamplePreset[]
```

`index.ts`: `export type { ExampleCategory, ExamplePreset, TexarynExample } from './types.js'`.

Add a `presets` array to each example, after its `initialData`:

```ts
// basics-required
presets: [
  { id: 'valid', label: 'Valid', data: { email: 'ada@example.com', referral: 'A friend' } },
  { id: 'missing-email', label: 'Missing email', data: { referral: 'A friend' }, invalid: true },
],

// validation-string-constraints
presets: [
  { id: 'valid', label: 'Valid', data: { username: 'grace', postcode: '10115' } },
  { id: 'too-short', label: 'Too short', data: { username: 'ab', postcode: '75001' }, invalid: true },
  { id: 'bad-postcode', label: 'Bad postcode', data: { username: 'ada', postcode: '7500A' }, invalid: true },
],

// validation-numeric-constraints
presets: [
  { id: 'valid', label: 'Valid', data: { age: 30, rating: 3 } },
  { id: 'out-of-range', label: 'Out of range', data: { age: 200, rating: 7 }, invalid: true },
],

// validation-exclusive-numeric-constraints
presets: [
  { id: 'valid', label: 'Valid', data: { discount: 0.5, quantity: 36 } },
  { id: 'on-the-bounds', label: 'On the bounds', data: { discount: 1, quantity: 10 }, invalid: true },
],

// validation-array-constraints
presets: [
  { id: 'valid', label: 'One skill', data: { skills: ['typescript'] } },
  { id: 'empty', label: 'Empty', data: { skills: [] }, invalid: true },
  { id: 'duplicates', label: 'Duplicates', data: { skills: ['css', 'css'] }, invalid: true },
],

// conditional-if-then-else
presets: [
  { id: 'business', label: 'Business', data: { accountType: 'business', companyName: 'Acme', taxId: 'FR123' } },
  { id: 'personal', label: 'Personal', data: { accountType: 'personal', nickname: 'ada' } },
],

// composition-one-of
presets: [
  { id: 'circle', label: 'Circle', data: { kind: 'circle', radius: 5 } },
  { id: 'rectangle', label: 'Rectangle', data: { kind: 'rectangle', width: 4, height: 3 } },
  { id: 'missing-height', label: 'Rectangle without height', data: { kind: 'rectangle', width: 4 }, invalid: true },
],

// composition-any-of
presets: [
  { id: 'text', label: 'Text', data: { value: 'hello' } },
  { id: 'number', label: 'Number', data: { value: 42 } },
  { id: 'neither', label: 'Neither', data: { value: '' }, invalid: true },
],

// runtime-array-interactions
presets: [
  { id: 'empty', label: 'Empty list', data: { items: [] } },
  { id: 'five', label: 'Five items', data: { items: ['milk', 'bread', 'eggs', 'apples', 'coffee'] } },
],

// runtime-validation-triggers
presets: [
  { id: 'valid', label: 'All valid', data: { onChange: 'abc', onBlur: 'abc', onSubmit: 'abc' } },
  { id: 'too-short', label: 'All too short', data: { onChange: 'a', onBlur: 'a', onSubmit: 'a' }, invalid: true },
],

// runtime-submission
presets: [
  { id: 'ready', label: 'Ready to submit', data: { email: 'ada@example.com' } },
  { id: 'too-short', label: 'Too short', data: { email: 'ab' }, invalid: true },
],
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run --project examples && pnpm vitest run --project example-conformance`
Expected: PASS. A preset that fails its declaration names the example and preset id; fix the data, not the flag.

- [ ] **Step 5: Commit**

```bash
git add packages/examples/src
git commit -m "feat(examples): add named data presets to the examples where states matter"
```

### Task 16: Preset menu and width presets in the preview

**Files:**
- Create: `apps/playground/src/workbench/presets.ts`
- Create: `apps/playground/src/workbench/PreviewControls.tsx`
- Modify: `apps/playground/src/workbench/PreviewPane.tsx` (`previewWidth` prop, the frame)
- Modify: `apps/playground/src/App.tsx` (preview header children)
- Modify: `apps/playground/src/playground.css`
- Test: `apps/playground/src/__tests__/presets.test.tsx`

**Interfaces:**
- Consumes: `ExamplePreset` (Task 15), `useWorkspace` (Task 4), `PreviewWidth` and `LayoutAction` (Task 3).
- Produces: `applyPreset(runtime: FormRuntime, data: unknown, invalid: boolean): void`, `PREVIEW_WIDTHS: readonly { id: PreviewWidth; label: string; px: number | null }[]`, `WidthPresets` props `{ width: PreviewWidth; onChange: (width: PreviewWidth) => void }`, `DataPresetSelect` props `{ presets: readonly ExamplePreset[]; initialData: unknown }`, `PreviewPane` gains `previewWidth: PreviewWidth`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { App } from '../App.js'
import { editSchema } from './schema-text.js'

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

async function open(title: string): Promise<void> {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: title }))
}

function presetSelect(): HTMLSelectElement {
  return screen.getByLabelText('Data preset') as HTMLSelectElement
}

describe('data presets', () => {
  it('apply in place and show the errors of an invalid preset', async () => {
    await open('String constraints')
    fireEvent.change(presetSelect(), { target: { value: 'too-short' } })
    const username = (await screen.findByLabelText('Username')) as HTMLInputElement
    await waitFor(() => expect(username.value).toBe('ab'))
    await waitFor(() => expect(username.getAttribute('aria-invalid')).toBe('true'))
    fireEvent.change(presetSelect(), { target: { value: 'valid' } })
    await waitFor(() => expect(username.value).toBe('grace'))
    expect(username.getAttribute('aria-invalid')).not.toBe('true')
  })

  it('reads Custom after the user edits', async () => {
    await open('String constraints')
    fireEvent.change(presetSelect(), { target: { value: 'valid' } })
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'linus' } })
    await waitFor(() => expect(presetSelect().value).toBe('custom'))
  })

  it('apply to the form on screen while the JSON is invalid', async () => {
    await open('String constraints')
    editSchema('{')
    fireEvent.change(presetSelect(), { target: { value: 'too-short' } })
    await waitFor(() => expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('ab'))
  })

  it('do not appear for an example without presets', async () => {
    await open('String field')
    await screen.findByLabelText('Name')
    expect(screen.queryByLabelText('Data preset')).toBeNull()
  })
})

describe('width presets', () => {
  it('narrow the rendered form and remember the choice', async () => {
    await open('String field')
    fireEvent.click(screen.getByRole('button', { name: 'Phone' }))
    const frame = document.querySelector<HTMLElement>('.pg-preview-frame')!
    expect(frame.style.maxWidth).toBe('375px')
    expect(screen.getByText('375px')).toBeTruthy()
    cleanup()
    await open('String field')
    expect(screen.getByRole('button', { name: 'Phone', pressed: true })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/presets.test.tsx`
Expected: FAIL, no "Data preset" control.

- [ ] **Step 3: Implement**

`apps/playground/src/workbench/presets.ts`:

```ts
import type { FormRuntime } from '@texaryn/core'

// SetTouched on every field shows an invalid preset's errors the way leaving
// each field would, without submitting.
export function applyPreset(runtime: FormRuntime, data: unknown, invalid: boolean): void {
  runtime.dispatch({ type: 'Reset', data })
  if (!invalid) return
  for (const node of Object.values(runtime.document.getSnapshot().nodes)) {
    if (node.type === 'field') runtime.dispatch({ type: 'SetTouched', nodeId: node.id })
  }
}
```

`apps/playground/src/workbench/PreviewControls.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@texaryn/react'
import type { ExamplePreset } from '@texaryn/examples'
import type { PreviewWidth } from './layout.js'
import { applyPreset } from './presets.js'
import { useWorkspace } from './workspace.js'

export const PREVIEW_WIDTHS: readonly { id: PreviewWidth; label: string; px: number | null }[] = [
  { id: 'phone', label: 'Phone', px: 375 },
  { id: 'tablet', label: 'Tablet', px: 768 },
  { id: 'fit', label: 'Fit', px: null },
]

export function WidthPresets({ width, onChange }: { width: PreviewWidth; onChange: (width: PreviewWidth) => void }) {
  return (
    <div className="pg-width-presets" role="group" aria-label="Preview width">
      {PREVIEW_WIDTHS.map(({ id, label }) => (
        <button key={id} type="button" aria-pressed={width === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function DataPresetSelect({ presets, initialData }: { presets: readonly ExamplePreset[]; initialData: unknown }) {
  const { runtime, runtimeId } = useWorkspace()
  const data = useStore(runtime.data)
  const [selected, setSelected] = useState('initial')
  const applied = useRef<unknown>(undefined)

  useEffect(() => {
    setSelected('initial')
    applied.current = runtime.data.getSnapshot()
  }, [runtimeId, runtime])

  useEffect(() => {
    if (applied.current !== undefined && data !== applied.current) setSelected('custom')
  }, [data])

  if (presets.length === 0) return null

  return (
    <label className="pg-preset">
      <span>Data</span>
      <select
        aria-label="Data preset"
        value={selected}
        onChange={(event) => {
          const id = event.target.value
          const preset = presets.find((candidate) => candidate.id === id)
          applyPreset(runtime, preset ? preset.data : initialData, preset?.invalid === true)
          applied.current = runtime.data.getSnapshot()
          setSelected(id)
        }}
      >
        <option value="initial">Initial</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.invalid ? `${preset.label} (invalid)` : preset.label}
          </option>
        ))}
        {selected === 'custom' && <option value="custom">Custom</option>}
      </select>
    </label>
  )
}
```

In `PreviewPane.tsx`, take `previewWidth` and wrap the surface:

```tsx
const px = PREVIEW_WIDTHS.find((entry) => entry.id === previewWidth)?.px ?? null
// …
<div className="pg-preview-frame" style={px === null ? undefined : { maxWidth: `${px}px` }}>
  {px !== null && <p className="pg-preview-frame__label">{px}px</p>}
  <RendererSurface key={runtimeId} rendererKey={rendererKey} label={renderer.label} theme={resolvedTheme}>
    {renderer.kind === 'react' ? <FormRoot registry={renderer.registry} /> : <renderer.Host runtime={runtime} />}
  </RendererSurface>
</div>
```

In `App.tsx`, the preview `PaneHeader` children become the renderer select, `<WidthPresets width={layout.previewWidth} onChange={(width) => dispatchLayout({ type: 'setPreviewWidth', width })} />` and, inside the workspace provider, `<DataPresetSelect presets={edited ? [] : (selectedExample?.presets ?? [])} initialData={selectedExample?.initialData} />`. Presets are offered only for an unedited example, whose schema they were written for.

`playground.css`:

```css
.pg-preview-frame {
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.pg-preview-frame__label {
  margin: 0 0 0.5rem;
  text-align: center;
  font-size: 0.75rem;
  color: var(--tx-text-muted);
}

.pg-width-presets {
  display: inline-flex;
  border: 1px solid var(--tx-border);
  border-radius: var(--tx-radius);
  overflow: hidden;
}

.pg-width-presets button {
  font: inherit;
  padding: 0.15rem 0.5rem;
  border: 0;
  background: none;
  color: var(--tx-text-muted);
  cursor: pointer;
}

.pg-width-presets button[aria-pressed='true'] {
  background: var(--tx-accent-soft);
  color: var(--tx-text);
}

.pg-preset {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
```

- [ ] **Step 4: Run the playground project**

Run: `pnpm vitest run --project playground`
Expected: PASS. If the Vue, Svelte, Solid or Web Components renderers mark errors differently after `SetTouched`, record which in the pull request: this is the spec's second open question.

- [ ] **Step 5: Check every renderer by hand once**

Run: `pnpm --filter @texaryn/playground dev`, open String constraints, apply Too short with each of the nine renderers, and note whether the error shows. Put the result in the pull request description.

- [ ] **Step 6: Commit and open the pull request**

```bash
git add apps/playground/src
git commit -m "feat(playground): data presets and preview width presets"
```

Run `pnpm build && pnpm typecheck && pnpm test && pnpm site:build`, push, and open the pull request.

---

## PR 4: Command palette

Branch `feat/playground-command-palette`, from `main` after PR 3 merges.

### Task 17: The command list

**Files:**
- Create: `apps/playground/src/palette/commands.ts`
- Test: `apps/playground/src/__tests__/commands.test.ts`

**Interfaces:**
- Consumes: `TexarynExample`, `ExamplePreset`, `RendererKey`, `LayoutAction`, `ThemePreference`.
- Produces: `type CommandGroup = 'Examples' | 'Renderers' | 'Data presets' | 'Layout' | 'Theme' | 'Schema' | 'Help'`, `interface PaletteCommand { id: string; group: CommandGroup; label: string; keywords?: readonly string[]; run: () => void }`, `interface CommandActions`, `interface CommandInput`, `buildCommands(input: CommandInput): PaletteCommand[]`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi } from 'vitest'
import { examples } from '@texaryn/examples'
import { buildCommands } from '../palette/commands.js'
import type { CommandActions } from '../palette/commands.js'

function actions(): CommandActions {
  return {
    selectExample: vi.fn(),
    selectRenderer: vi.fn(),
    applyPreset: vi.fn(),
    layout: vi.fn(),
    resetLayout: vi.fn(),
    setTheme: vi.fn(),
    formatSchema: vi.fn(),
    copySchema: vi.fn(),
    copyData: vi.fn(),
    openDocs: vi.fn(),
  }
}

const renderers = [
  { key: 'default', label: 'React · Default' },
  { key: 'bootstrap', label: 'React · Bootstrap 5' },
] as const

describe('buildCommands', () => {
  it('offers every example and every renderer', () => {
    const commands = buildCommands({ examples, renderers, presets: [], canFormat: true, actions: actions() })
    expect(commands.filter((command) => command.group === 'Examples')).toHaveLength(examples.length)
    expect(commands.filter((command) => command.group === 'Renderers')).toHaveLength(renderers.length)
  })

  it('runs the matching action', () => {
    const spy = actions()
    const commands = buildCommands({ examples, renderers, presets: [], canFormat: true, actions: spy })
    commands.find((command) => command.label === 'Switch to React · Bootstrap 5')!.run()
    expect(spy.selectRenderer).toHaveBeenCalledWith('bootstrap')
    commands.find((command) => command.label === 'Maximize preview')!.run()
    expect(spy.layout).toHaveBeenCalledWith({ type: 'maximize', pane: 'preview' })
  })

  it('offers the current example presets and Format only when it can run', () => {
    const presets = [{ id: 'valid', label: 'Valid', data: {} }]
    const withPresets = buildCommands({ examples, renderers, presets, canFormat: false, actions: actions() })
    expect(withPresets.some((command) => command.label === 'Apply data preset: Valid')).toBe(true)
    expect(withPresets.some((command) => command.label === 'Format schema')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/commands.test.ts`
Expected: FAIL, cannot resolve `../palette/commands.js`.

- [ ] **Step 3: Implement `apps/playground/src/palette/commands.ts`**

```ts
import type { ExamplePreset, TexarynExample } from '@texaryn/examples'
import type { RendererKey } from '../routing.js'
import type { ThemePreference } from '../theme.js'
import type { LayoutAction } from '../workbench/layout.js'

export type CommandGroup = 'Examples' | 'Renderers' | 'Data presets' | 'Layout' | 'Theme' | 'Schema' | 'Help'

export interface PaletteCommand {
  id: string
  group: CommandGroup
  label: string
  keywords?: readonly string[]
  run: () => void
}

export interface CommandActions {
  selectExample(example: TexarynExample): void
  selectRenderer(key: RendererKey): void
  applyPreset(preset: ExamplePreset | null): void
  layout(action: LayoutAction): void
  resetLayout(): void
  setTheme(preference: ThemePreference): void
  formatSchema(): void
  copySchema(): void
  copyData(): void
  openDocs(): void
}

export interface CommandInput {
  examples: readonly TexarynExample[]
  renderers: readonly { key: RendererKey; label: string }[]
  presets: readonly ExamplePreset[]
  canFormat: boolean
  actions: CommandActions
}

export function buildCommands({ examples, renderers, presets, canFormat, actions }: CommandInput): PaletteCommand[] {
  const commands: PaletteCommand[] = []
  for (const example of examples) {
    commands.push({
      id: `example:${example.id}`,
      group: 'Examples',
      label: example.title,
      keywords: [example.id, example.category],
      run: () => actions.selectExample(example),
    })
  }
  for (const { key, label } of renderers) {
    commands.push({ id: `renderer:${key}`, group: 'Renderers', label: `Switch to ${label}`, run: () => actions.selectRenderer(key) })
  }
  if (presets.length > 0) {
    commands.push({ id: 'preset:initial', group: 'Data presets', label: 'Apply data preset: Initial', run: () => actions.applyPreset(null) })
    for (const preset of presets) {
      commands.push({
        id: `preset:${preset.id}`,
        group: 'Data presets',
        label: `Apply data preset: ${preset.label}`,
        run: () => actions.applyPreset(preset),
      })
    }
  }
  const layout = (id: string, label: string, action: LayoutAction): PaletteCommand => ({
    id: `layout:${id}`,
    group: 'Layout',
    label,
    run: () => actions.layout(action),
  })
  commands.push(
    layout('focus', 'Toggle Focus mode', { type: 'toggleFocus' }),
    layout('max-schema', 'Maximize schema', { type: 'maximize', pane: 'schema' }),
    layout('max-preview', 'Maximize preview', { type: 'maximize', pane: 'preview' }),
    layout('max-inspector', 'Maximize inspector', { type: 'maximize', pane: 'inspector' }),
    layout('inspector', 'Collapse or expand the inspector', { type: 'toggleInspector' }),
    { id: 'layout:reset', group: 'Layout', label: 'Reset layout', run: actions.resetLayout },
  )
  for (const preference of ['light', 'dark', 'auto'] as const) {
    commands.push({ id: `theme:${preference}`, group: 'Theme', label: `Theme: ${preference}`, run: () => actions.setTheme(preference) })
  }
  if (canFormat) commands.push({ id: 'schema:format', group: 'Schema', label: 'Format schema', run: actions.formatSchema })
  commands.push(
    { id: 'schema:copy', group: 'Schema', label: 'Copy schema', run: actions.copySchema },
    { id: 'schema:copy-data', group: 'Schema', label: 'Copy data', run: actions.copyData },
    { id: 'help:docs', group: 'Help', label: 'Open the documentation', run: actions.openDocs },
  )
  return commands
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run --project playground src/__tests__/commands.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/playground/src/palette/commands.ts apps/playground/src/__tests__/commands.test.ts
git commit -m "feat(playground): build the command palette's command list"
```

### Task 18: The palette

**Files:**
- Modify: `apps/playground/package.json` (`pnpm --filter @texaryn/playground add -E cmdk@1.1.1`)
- Create: `apps/playground/src/palette/CommandPalette.tsx` (default export, the lazy chunk)
- Create: `apps/playground/src/palette-slot.tsx` (in the main bundle: lazy wrapper and the shortcut)
- Modify: `apps/playground/src/App.tsx` (open state, commands, rail button, status hint)
- Modify: `apps/playground/src/playground.css`
- Test: `apps/playground/src/__tests__/command-palette.test.tsx`

**Interfaces:**
- Consumes: `buildCommands`, `PaletteCommand` (Task 17); `applyPreset` (Task 16); `StatusBar` `hint` (Task 8).
- Produces: `CommandPalette` props `{ open: boolean; onOpenChange: (open: boolean) => void; commands: readonly PaletteCommand[] }`, `useCommandPaletteShortcut(onOpen: () => void): void`, `CommandPaletteSlot` with the same props as `CommandPalette`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { App } from '../App.js'

afterEach(cleanup)

async function openPalette(): Promise<HTMLElement> {
  render(<App />)
  await screen.findByRole('navigation', { name: 'Examples' })
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
  return screen.findByRole('dialog', { name: 'Command palette' })
}

describe('the command palette', () => {
  it('opens on Ctrl K and switches renderer from the keyboard', async () => {
    const dialog = await openPalette()
    const input = dialog.querySelector('input')!
    fireEvent.change(input, { target: { value: 'bootst' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull())
    expect((screen.getByLabelText(/renderer/i) as HTMLSelectElement).value).toBe('bootstrap')
  })

  it('opens on Cmd K too, and closes on Escape', async () => {
    render(<App />)
    await screen.findByRole('navigation', { name: 'Examples' })
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull())
  })

  it('selects an example by name', async () => {
    const dialog = await openPalette()
    const input = dialog.querySelector('input')!
    fireEvent.change(input, { target: { value: 'Number field' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByLabelText('Price')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/command-palette.test.tsx`
Expected: FAIL, no dialog.

- [ ] **Step 3: Implement**

`apps/playground/src/palette/CommandPalette.tsx`:

```tsx
import { Command } from 'cmdk'
import type { CommandGroup, PaletteCommand } from './commands.js'

const ORDER: readonly CommandGroup[] = ['Examples', 'Renderers', 'Data presets', 'Layout', 'Theme', 'Schema', 'Help']

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: readonly PaletteCommand[]
}

export default function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  return (
    // `label` becomes the dialog's aria-label; `contentClassName` styles the
    // dialog itself, while `className` would reach only the list root inside it.
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      contentClassName="pg-palette"
      overlayClassName="pg-palette__overlay"
    >
      <Command.Input className="pg-palette__input" placeholder="Search examples, renderers and actions" />
      <Command.List className="pg-palette__list">
        <Command.Empty>No command matches.</Command.Empty>
        {ORDER.map((group) => {
          const entries = commands.filter((command) => command.group === group)
          if (entries.length === 0) return null
          return (
            <Command.Group key={group} heading={group}>
              {entries.map((command) => (
                <Command.Item
                  key={command.id}
                  value={command.label}
                  keywords={command.keywords ? [...command.keywords] : undefined}
                  onSelect={() => {
                    onOpenChange(false)
                    command.run()
                  }}
                >
                  {command.label}
                </Command.Item>
              ))}
            </Command.Group>
          )
        })}
      </Command.List>
    </Command.Dialog>
  )
}
```

`apps/playground/src/palette-slot.tsx`:

```tsx
import { Suspense, lazy, useEffect } from 'react'
import type { CommandPaletteProps } from './palette/CommandPalette.js'

const CommandPalette = lazy(() => import('./palette/CommandPalette.js'))

export function useCommandPaletteShortcut(onOpen: () => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpen()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpen])
}

// The chunk loads on the first open, so a visitor who never opens it pays nothing.
export function CommandPaletteSlot(props: CommandPaletteProps) {
  if (!props.open) return null
  return (
    <Suspense fallback={null}>
      <CommandPalette {...props} />
    </Suspense>
  )
}
```

In `App.tsx`:

```tsx
const [paletteOpen, setPaletteOpen] = useState(false)
const openPalette = useCallback(() => setPaletteOpen(true), [])
useCommandPaletteShortcut(openPalette)
const commands = buildCommands({
  examples,
  renderers: Object.entries(renderers).map(([key, spec]) => ({ key: key as RendererKey, label: spec.label })),
  presets: edited ? [] : (selectedExample?.presets ?? []),
  canFormat: parseError === null,
  actions: {
    selectExample: handleSelectExample,
    selectRenderer: setRendererKey,
    applyPreset: (preset) => {
      if (workspace) applyPreset(workspace.runtime, preset ? preset.data : selectedExample?.initialData, preset?.invalid === true)
    },
    layout: dispatchLayout,
    resetLayout,
    setTheme: theme.setPreference,
    formatSchema: () => handleSchemaChange(JSON.stringify(JSON.parse(schemaText), null, 2)),
    copySchema: () => void navigator.clipboard?.writeText(schemaText),
    copyData: () => {
      if (workspace) void navigator.clipboard?.writeText(JSON.stringify(workspace.runtime.data.getSnapshot(), null, 2))
    },
    openDocs: () => window.open(DOCS_URL, '_self'),
  },
})
```

Render `<CommandPaletteSlot open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />` at the end of `.pg-app`, a rail button `<button type="button" className="pg-rail__button" aria-label="Open command palette" onClick={openPalette}>Commands</button>` under the Examples button, and `hint={<kbd>Ctrl K</kbd>}` on `StatusBar`.

`playground.css`:

```css
.pg-palette {
  position: fixed;
  top: 15vh;
  left: 50%;
  z-index: 10;
  width: min(560px, calc(100vw - 32px));
  transform: translateX(-50%);
  overflow: hidden;
  background: var(--tx-surface-raised);
  border: 1px solid var(--tx-border-strong);
  border-radius: calc(var(--tx-radius) * 2);
  box-shadow: var(--tx-shadow);
}

.pg-palette__overlay {
  position: fixed;
  inset: 0;
  z-index: 9;
  background: rgb(0 0 0 / 30%);
}

.pg-palette__input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.75rem 1rem;
  font: inherit;
  color: var(--tx-text);
  background: none;
  border: 0;
  border-bottom: 1px solid var(--tx-border);
}

.pg-palette__list {
  max-height: 50vh;
  overflow: auto;
  padding: 0.25rem;
}

.pg-palette [cmdk-group-heading] {
  padding: 0.5rem 0.75rem 0.25rem;
  font-size: 0.75rem;
  color: var(--tx-text-muted);
}

.pg-palette [cmdk-item] {
  padding: 0.4rem 0.75rem;
  border-radius: var(--tx-radius);
  cursor: pointer;
}

.pg-palette [cmdk-item][data-selected='true'] {
  background: var(--tx-accent-soft);
}
```

- [ ] **Step 4: Run the playground project and the size check**

Run: `pnpm vitest run --project playground && pnpm build && pnpm --filter @texaryn/playground build:pages && node scripts/check-playground-size.mjs apps/playground/dist`
Expected: PASS, and the `palette` chunk under 25 KB.

- [ ] **Step 5: Commit and open the pull request**

```bash
git add apps/playground pnpm-lock.yaml
git commit -m "feat(playground): command palette on Ctrl K"
```

Run `pnpm build && pnpm typecheck && pnpm test && pnpm site:build`, push, and open the pull request with "Closes #239" only if every item in the tracker is done; otherwise reference it. After merge, on the live site: Ctrl K and Cmd K, switch renderer, jump to an example, apply a preset, and open the palette from the rail on a phone.

---

## Self-review against the spec

| Spec section | Task |
| --- | --- |
| Layout A, default sizes and minimums | 5 |
| State ownership: runtime above the layout | 4 |
| Pane operations: collapse, maximize, Focus, restore, reset | 3, 5 |
| No hover auto hide | 5, 6 (explicit buttons only) |
| Example list pinned, overlay, scroll into view | 6 |
| Phone layout below 800px | 7 |
| Status bar | 8, 13, 18 |
| Keyboard separators | 5, 9 |
| Editor extensions, Tab leaves, colors from tokens | 13 |
| `checkSchema`, escaped pointers, adapter options shared | 10 |
| Pointer to range | 11 |
| Keyword autocomplete, draft-07 default | 12 |
| Lazy editor with textarea fallback | 13 |
| Width presets | 16 |
| Data presets, contract and tests | 15, 16 |
| Command palette | 17, 18 |
| Browser tests at three sizes and two themes | 9, 13 |
| Size budget and its check | 14, 18 |
| #232 first | 1, 2 |
