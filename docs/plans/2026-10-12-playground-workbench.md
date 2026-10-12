# Playground Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status on 2026-10-12:** PR 1, [#245](https://github.com/texaryn/texaryn/pull/245), and PR 2, [#247](https://github.com/texaryn/texaryn/pull/247), are merged. Their task steps and code snippets below are historical and superseded by `main`. Do not execute them. In particular, Task 11's HTML-regex size checker is obsolete; the current checker measures static import closures from Vite's manifest. Only PR 3 and PR 4 remain active.

**Goal:** Give the playground a desktop workbench on top of #241: resizable panes with Maximize, Focus and a collapsible inspector, a CodeMirror schema editor checked by Texaryn's own schema library, data and width presets, and a command palette, while phones keep #241's layout.

**Architecture:** PR 1, the persistent workbench shell, and PR 2, the lazy CodeMirror editor with public `checkSchema`, are complete in #245 and #247. PR 3 adds data presets to the `@texaryn/examples` contract and the playground controls, plus width presets. PR 4 adds a `cmdk` palette.

**Tech Stack:** React 19, Vite 6, Vitest 3.2 (jsdom and Playwright Chromium browser mode), `react-resizable-panels` 4.14.4, CodeMirror 6 (`@codemirror/*`, `@lezer/json`), `cmdk` 1.1.1, `@texaryn/json-schema-library` 11.6.6 through `@texaryn/schema-json`.

**Spec:** `docs/plans/2026-10-12-playground-workbench-design.md` ([#242](https://github.com/texaryn/texaryn/pull/242)). Read it before any task. The baseline is `main` at `fe20255` (#247).

## Global Constraints

- One pull request per remaining PR, each on a fresh branch from `main`: `feat/playground-presets`, `feat/playground-command-palette`.
- Conventional commit subjects. No `Co-Authored-By` or agent attribution in commits, branches or pull requests. SSH remotes.
- No dash punctuation in prose, comments, commit messages or pull request descriptions. Hyphens in compound words stay.
- Code comments only for invariants, external contracts or intentional limits.
- Exact pins: `react-resizable-panels@4.14.4`, `cmdk@1.1.1`. Install CodeMirror packages with `pnpm add -E` so the lockfile pins what resolves.
- Breakpoint: the desktop workbench applies from 820px; below it, #241's phone layout applies, through `(max-width: 819px)`. The desktop minimums add up to 768px (example list 160, schema 280, preview 320, two 4px separators), so #241's `(max-width: 760px)` would leave 761px to 767px with constraints no layout can satisfy. Task 3 moves #241's phone media query to 819px so the stylesheet and the tree agree.
- Panel sizes in `react-resizable-panels` 4: a number is pixels and a bare number string is a percentage, so write `defaultSize="46"` and `minSize={280}`.
- Layout numbers: example list 216px (minimum 160px); schema 46% and preview 54% of the top row (minimums 280px and 320px); top row 72% and inspector 28% (inspector minimum 120px, collapsed to a 32px header).
- `useDefaultLayout` always gets `onlySaveAfterUserInteractions: true`.
- Timing: #241's schema apply debounce stays 300ms; editor lint delay 300ms.
- Storage keys: layout state under `texaryn-playground-layout` (version 1); panel sizes under the prefix `texaryn-playground-panels:`. Every storage read and write sits in a `try` block, as `theme.ts` does.
- Preview widths: Phone 375px, Tablet 768px, Fit.
- Size limits enforced by `scripts/check-playground-size.mjs`: first-load scripts at most 175 KB gzipped, the `editor` chunk at most 150 KB, the `palette` chunk at most 25 KB.
- Changesets: PR 2 added a minor `@texaryn/schema-json` changeset. PR 3 adds the public `Validate` command to `@texaryn/core`, so it needs a minor changeset and regenerated `docs/api`. `@texaryn/playground` and private `@texaryn/examples` do not publish changesets.
- UI copy is sentence case.
- Before each pull request: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm site:build`. Pages deploys only from `main`, so after each merge check the change on https://texaryn.github.io/texaryn/playground/.

## Contracts

Every task's tests protect these. A change that breaks one is wrong even if its own tests pass.

1. **Content is never remounted by layout.** The example list, the schema editor, the preview and the inspector render through portals into four persistent hosts. Moving a host between the desktop panels, the Maximize or Focus overlay and the phone columns keeps its React subtree and its DOM node. It does not keep keyboard focus: a browser blurs a focused element when its node moves, so no test may expect focus to survive a breakpoint crossing.
2. **The runtime lifecycle is #241's.** `FormWorkspace` owns the runtime through `useForm`, keyed by `${adapterState.id}:${exampleRevision}:${resetRevision}`, and carries data through `latestData` and `preserveCurrentData`. No task creates or destroys a runtime anywhere else.
3. **Layout state never changes saved sizes by itself.** Maximize and Focus are overlays above the panel group, which keeps its sizes; `useDefaultLayout` saves only user interactions. Restore is removing the overlay.
4. **Hidden means unreachable.** A pane nobody can see is `inert`: the panel group under an overlay, the body of a collapsed inspector, a collapsed example list.

## Review Focus

- **Crossing the 820px breakpoint while a form has data and the editor has undo history.** Data, the input element, the editor's text, its history and its click positions all survive, and Submit still submits once. Pinned in Task 4 (jsdom), Task 6 and Task 10 (Chromium).
- **Opening and closing an overlay from the keyboard.** Focus moves to the overlay's Restore or Exit Focus button and back to the button that opened it. Pinned in Task 3.
- **Maximize, then Restore, after the user dragged a separator.** Every pane returns to the exact pixel size it had, and a reload shows the dragged size, not a maximized one. Pinned in Task 3 and Task 6.
- **Property names containing `/` or `~`, including an ambiguous path.** Unique paths resolve to exact RFC 6901 pointers; an ambiguous one resolves to the longest prefix every reading shares. Pinned in Task 7 and Task 8.
- **A check that finishes after the document changed.** Its diagnostics and its error count are dropped. Pinned in Task 10.
- **Applying a data preset while the editor holds invalid JSON.** The preset applies to the form on screen, which still came from the unedited example. Pinned in Task 13.

---

## PR 1: Workbench shell, completed in #245

The implementation below is historical. Its code snippets are superseded by the merged implementation in [#245](https://github.com/texaryn/texaryn/pull/245). The current source on `main` is authoritative.

Branch `feat/playground-workbench-shell`.

### Task 1: Layout state

**Files:**
- Create: `apps/playground/src/workbench/layout.ts`
- Test: `apps/playground/src/__tests__/layout.test.ts`

**Interfaces:**
- Produces: `type PaneId = 'schema' | 'preview' | 'inspector'`, `type PreviewWidth = 'phone' | 'tablet' | 'fit'`, `interface LayoutState { version: 1; inspectorCollapsed: boolean; examplesCollapsed: boolean; maximized: PaneId | null; focus: boolean; previewWidth: PreviewWidth }`, `DEFAULT_LAYOUT`, `type LayoutAction`, `layoutReducer(state, action): LayoutState`, `type WorkbenchView = { kind: 'panels' } | { kind: 'focus' } | { kind: 'maximized'; pane: PaneId }`, `activeView(state): WorkbenchView`, `LAYOUT_STORAGE_KEY`, `parseStoredLayout(raw: string | null): LayoutState`, `readStoredLayout(): LayoutState`, `writeStoredLayout(state): void`, `PANEL_STORAGE_PREFIX`, `panelStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void }`, `clearStoredPanelSizes(): void`, `useLayout(): [LayoutState, (action: LayoutAction) => void]`.

- [x] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE_KEY,
  PANEL_STORAGE_PREFIX,
  activeView,
  clearStoredPanelSizes,
  layoutReducer,
  panelStorage,
  parseStoredLayout,
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

  it('keeps Focus and maximize exclusive', () => {
    const focused = layoutReducer(DEFAULT_LAYOUT, { type: 'toggleFocus' })
    const max = layoutReducer(focused, { type: 'maximize', pane: 'preview' })
    expect(max).toMatchObject({ focus: false, maximized: 'preview' })
    expect(layoutReducer(max, { type: 'toggleFocus' })).toMatchObject({ focus: true, maximized: null })
  })

  it('restores from both maximize and Focus without touching collapse state', () => {
    const collapsed = layoutReducer(DEFAULT_LAYOUT, { type: 'toggleInspector' })
    const max = layoutReducer(collapsed, { type: 'maximize', pane: 'inspector' })
    expect(layoutReducer(max, { type: 'restore' })).toMatchObject({
      maximized: null,
      focus: false,
      inspectorCollapsed: true,
    })
  })

  it('collapses and expands the example list', () => {
    const collapsed = layoutReducer(DEFAULT_LAYOUT, { type: 'toggleExamples' })
    expect(collapsed.examplesCollapsed).toBe(true)
    expect(layoutReducer(collapsed, { type: 'toggleExamples' }).examplesCollapsed).toBe(false)
  })

  it('resets to the defaults', () => {
    const changed = layoutReducer(DEFAULT_LAYOUT, { type: 'setPreviewWidth', width: 'phone' })
    expect(layoutReducer(changed, { type: 'reset' })).toEqual(DEFAULT_LAYOUT)
  })
})

describe('activeView', () => {
  it('names the panels, Focus and a maximized pane', () => {
    expect(activeView(DEFAULT_LAYOUT)).toEqual({ kind: 'panels' })
    expect(activeView({ ...DEFAULT_LAYOUT, focus: true })).toEqual({ kind: 'focus' })
    expect(activeView({ ...DEFAULT_LAYOUT, maximized: 'preview' })).toEqual({ kind: 'maximized', pane: 'preview' })
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
    expect(parseStoredLayout(raw)).toEqual({ ...DEFAULT_LAYOUT, inspectorCollapsed: true, previewWidth: 'tablet' })
  })

  it('namespaces panel sizes and clears only its own keys', () => {
    panelStorage.setItem('columns', '{"examples":20}')
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, '{}')
    expect(window.localStorage.getItem(`${PANEL_STORAGE_PREFIX}columns`)).toBe('{"examples":20}')
    clearStoredPanelSizes()
    expect(panelStorage.getItem('columns')).toBeNull()
    expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('{}')
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/layout.test.ts`
Expected: FAIL, cannot resolve `../workbench/layout.js`.

- [x] **Step 3: Implement `apps/playground/src/workbench/layout.ts`**

```ts
import { useEffect, useReducer } from 'react'

export type PaneId = 'schema' | 'preview' | 'inspector'
export type PreviewWidth = 'phone' | 'tablet' | 'fit'

export interface LayoutState {
  version: 1
  inspectorCollapsed: boolean
  examplesCollapsed: boolean
  maximized: PaneId | null
  focus: boolean
  previewWidth: PreviewWidth
}

export const DEFAULT_LAYOUT: LayoutState = {
  version: 1,
  inspectorCollapsed: false,
  examplesCollapsed: false,
  maximized: null,
  focus: false,
  previewWidth: 'fit',
}

export type LayoutAction =
  | { type: 'toggleInspector' }
  | { type: 'setInspectorCollapsed'; collapsed: boolean }
  | { type: 'toggleExamples' }
  | { type: 'maximize'; pane: PaneId }
  | { type: 'restore' }
  | { type: 'toggleFocus' }
  | { type: 'setPreviewWidth'; width: PreviewWidth }
  | { type: 'reset' }

export function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case 'toggleInspector':
      return { ...state, inspectorCollapsed: !state.inspectorCollapsed }
    case 'setInspectorCollapsed':
      return { ...state, inspectorCollapsed: action.collapsed }
    case 'toggleExamples':
      return { ...state, examplesCollapsed: !state.examplesCollapsed }
    case 'maximize':
      return state.maximized === action.pane
        ? { ...state, maximized: null }
        : { ...state, maximized: action.pane, focus: false }
    case 'restore':
      return { ...state, maximized: null, focus: false }
    case 'toggleFocus':
      return { ...state, focus: !state.focus, maximized: null }
    case 'setPreviewWidth':
      return { ...state, previewWidth: action.width }
    case 'reset':
      return DEFAULT_LAYOUT
  }
}

export type WorkbenchView = { kind: 'panels' } | { kind: 'focus' } | { kind: 'maximized'; pane: PaneId }

export function activeView(state: LayoutState): WorkbenchView {
  if (state.maximized) return { kind: 'maximized', pane: state.maximized }
  if (state.focus) return { kind: 'focus' }
  return { kind: 'panels' }
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
    examplesCollapsed: flag('examplesCollapsed', DEFAULT_LAYOUT.examplesCollapsed),
    maximized: PANES.includes(stored.maximized as PaneId) ? (stored.maximized as PaneId) : null,
    focus: flag('focus', DEFAULT_LAYOUT.focus),
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

- [x] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run --project playground src/__tests__/layout.test.ts`
Expected: PASS, 9 tests.

- [x] **Step 5: Commit**

```bash
git add apps/playground/src/workbench/layout.ts apps/playground/src/__tests__/layout.test.ts
git commit -m "feat(playground): add the workbench layout state"
```

### Task 2: Persistent pane hosts

This task changes no layout. It moves each column's content into a portal so later tasks can move the content without remounting it.

**Files:**
- Create: `apps/playground/src/workbench/pane-hosts.tsx`
- Modify: `apps/playground/src/App.tsx` (`NotReady` and `FormWorkspace` render into hosts; `App` renders slots in the existing columns)
- Modify: `apps/playground/src/playground.css` (`.pg-pane-slot`, `.pg-pane-host`)
- Test: `apps/playground/src/__tests__/pane-hosts.test.tsx`

**Interfaces:**
- Produces: `type PaneHostId = 'examples' | 'schema' | 'preview' | 'inspector'`, `type PaneHosts = Readonly<Record<PaneHostId, HTMLDivElement>>`, `usePaneHosts(): PaneHosts`, `PaneSlot` props `{ host: HTMLElement; className?: string; style?: CSSProperties }`, `PANE_ATTACH_EVENT = 'pg-pane-attach'`, dispatched on a host each time a slot attaches it.
- Changes: `NotReady` and `FormWorkspace` take `hosts: PaneHosts`.

- [x] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { App } from '../App.js'
import { PaneSlot, usePaneHosts } from '../workbench/pane-hosts.js'

afterEach(cleanup)

let mounts = 0

function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    mounts += 1
  }, [])
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      {count}
    </button>
  )
}

function Harness({ where }: { where: 'a' | 'b' }) {
  const hosts = usePaneHosts()
  return (
    <>
      {where === 'a' ? (
        <div data-testid="a">
          <PaneSlot host={hosts.preview} />
        </div>
      ) : (
        <section data-testid="b">
          <PaneSlot host={hosts.preview} />
        </section>
      )}
      {createPortal(<Counter />, hosts.preview)}
    </>
  )
}

describe('pane hosts', () => {
  it('move content between layouts without remounting it', () => {
    mounts = 0
    const { rerender } = render(<Harness where="a" />)
    const button = within(screen.getByTestId('a')).getByRole('button')
    fireEvent.click(button)
    fireEvent.click(button)
    rerender(<Harness where="b" />)
    const moved = within(screen.getByTestId('b')).getByRole('button')
    expect(moved).toBe(button)
    expect(moved.textContent).toBe('2')
    expect(mounts).toBe(1)
  })

  it('hold every column of the app', async () => {
    render(<App />)
    await screen.findByLabelText('Name')
    for (const id of ['examples', 'schema', 'preview', 'inspector']) {
      expect(document.querySelector(`[data-pane-host="${id}"]`)?.childElementCount).toBeGreaterThan(0)
    }
  })
})
```

- [x] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/pane-hosts.test.tsx`
Expected: FAIL, cannot resolve `../workbench/pane-hosts.js`.

- [x] **Step 3: Implement `apps/playground/src/workbench/pane-hosts.tsx`**

```tsx
import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

export type PaneHostId = 'examples' | 'schema' | 'preview' | 'inspector'
export type PaneHosts = Readonly<Record<PaneHostId, HTMLDivElement>>

function createHost(id: PaneHostId): HTMLDivElement {
  const host = document.createElement('div')
  host.className = 'pg-pane-host'
  host.dataset.paneHost = id
  return host
}

// A portal remounts its children when its container changes. These containers
// never change: layouts move them instead, which keeps every pane's React
// subtree and DOM alive across panels, overlays and the phone columns.
export function usePaneHosts(): PaneHosts {
  const [hosts] = useState<PaneHosts>(() => ({
    examples: createHost('examples'),
    schema: createHost('schema'),
    preview: createHost('preview'),
    inspector: createHost('inspector'),
  }))
  return hosts
}

// Fired on the host after it moves. Content that caches geometry, such as
// CodeMirror, re-measures on it.
export const PANE_ATTACH_EVENT = 'pg-pane-attach'

export function PaneSlot({ host, className, style }: { host: HTMLElement; className?: string; style?: CSSProperties }) {
  const slot = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const element = slot.current
    if (!element) return
    element.appendChild(host)
    host.dispatchEvent(new Event(PANE_ATTACH_EVENT))
    return () => {
      if (host.parentNode === element) element.removeChild(host)
    }
  }, [host])
  return <div ref={slot} className={className ?? 'pg-pane-slot'} style={style} />
}
```

In `App.tsx`:

1. `NotReady` takes `hosts` and renders its two parts as portals:

```tsx
function NotReady({ hosts, toolbar, children }: { hosts: PaneHosts; toolbar: ReactNode; children: ReactNode }) {
  return (
    <>
      {createPortal(
        <>
          {toolbar}
          <div className="pg-placeholder">{children}</div>
        </>,
        hosts.preview,
      )}
      {createPortal(
        <>
          <h2 className="pg-heading">Live Data</h2>
          <pre className="pg-pre">—</pre>
        </>,
        hosts.inspector,
      )}
    </>
  )
}
```

2. `FormWorkspace` takes `hosts` and returns the same two parts it renders today as portals, unchanged inside: everything that was inside `<section className="pg-col pg-col--preview">` goes to `createPortal(…, hosts.preview)`, and the `<Inspector …/>` that was inside `<aside className="pg-col pg-col--inspect">` goes to `createPortal(…, hosts.inspector)`. The `useForm` call, the key, the `<form>` and the Bootstrap path do not change.

3. In `App`, call `const hosts = usePaneHosts()`. Move the source column's content into two fragments rendered as portals, and leave slots where it was:

```tsx
const examplesContent = (
  <>
    <ExampleBrowser query={query} onQueryChange={setQuery} selectedId={selectedId} onSelect={handleSelectExample} />
    {selectedExample && <p className="pg-description">{selectedExample.description}</p>}
  </>
)
```

`schemaContent` is today's `pg-schema-heading` block, the editor tabs, `#schema-editor-panel` and the parse error, moved as they are. The columns become:

```tsx
<div className="pg-columns" data-mobile-panel={mobilePanel}>
  <aside className="pg-col pg-col--source" aria-label="Examples and schema">
    <PaneSlot host={hosts.examples} />
    <PaneSlot host={hosts.schema} />
  </aside>
  <section className="pg-col pg-col--preview">
    <PaneSlot host={hosts.preview} />
  </section>
  <aside className="pg-col pg-col--inspect" aria-label="Inspector">
    <PaneSlot host={hosts.inspector} />
  </aside>
</div>
{createPortal(examplesContent, hosts.examples)}
{createPortal(schemaContent, hosts.schema)}
```

followed by the existing `NotReady` or `FormWorkspace` branch, each given `hosts={hosts}`.

4. `playground.css`, after `.pg-col--inspect`:

```css
.pg-pane-slot {
  display: contents;
}

.pg-pane-host {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 0.75rem;
  min-width: 0;
  min-height: 0;
}
```

- [x] **Step 4: Run the whole playground project**

Run: `pnpm vitest run --project playground`
Expected: PASS, including every #241 test, because nothing visible changed.

- [x] **Step 5: Commit**

```bash
git add apps/playground/src
git commit -m "refactor(playground): render pane content into persistent hosts"
```

### Task 3: Desktop workbench

**Files:**
- Modify: `apps/playground/package.json` (`pnpm --filter @texaryn/playground add -E react-resizable-panels@4.14.4`)
- Create: `apps/playground/src/workbench/PaneHeader.tsx`
- Create: `apps/playground/src/workbench/Workbench.tsx`
- Create: `apps/playground/src/workbench/use-narrow-viewport.ts`
- Modify: `apps/playground/src/App.tsx` (render `Workbench` from 820px and #241's columns below; Focus and Reset layout in the header)
- Modify: `apps/playground/src/playground.css`
- Modify: `apps/playground/src/test-setup.ts` (`ResizeObserver` stub)
- Modify: `apps/playground/src/__tests__/schema-editor.test.tsx` (the phone selector test sets the narrow query)
- Test: `apps/playground/src/__tests__/workbench.test.tsx`

**Interfaces:**
- Consumes: `LayoutState`, `LayoutAction`, `activeView`, `panelStorage`, `clearStoredPanelSizes`, `useLayout` (Task 1); `PaneHosts`, `PaneSlot` (Task 2).
- Produces: `Workbench` props `{ hosts: PaneHosts; layout: LayoutState; dispatch: (action: LayoutAction) => void; resetSignal: number; previewHeader?: ReactNode; rail?: ReactNode }`. Panes render as `<section data-pane="<id>" aria-label="<Title>">`; overlays as `<div className="pg-overlay" data-view="focus|maximized">`.
- Produces: `PaneHeader` props `{ title: string; children?: ReactNode; actions?: ReactNode }`, `MaximizeButton` props `{ pane: PaneId; label: string; maximized: boolean; dispatch: (action: LayoutAction) => void; buttonRef?: Ref<HTMLButtonElement> }`, `NARROW_QUERY = '(max-width: 819px)'`, `useNarrowViewport(): boolean`.

- [x] **Step 1: Add the `ResizeObserver` stub to `test-setup.ts`**

`react-resizable-panels` constructs a `ResizeObserver`, which jsdom 25 lacks; without it the group fails to render with "is not a constructor" (checked 2026-10-12).

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

- [x] **Step 2: Write the failing tests**

```tsx
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { App } from '../App.js'
import { PANEL_STORAGE_PREFIX } from '../workbench/layout.js'

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

function host(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-pane-host="${id}"]`)
  if (!element) throw new Error(`no host ${id}`)
  return element
}

function inOverlay(id: string): boolean {
  return host(id).closest('.pg-overlay') !== null
}

function panels(): HTMLElement {
  return document.querySelector<HTMLElement>('.pg-workbench__panels')!
}

async function openWithData(): Promise<HTMLInputElement> {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
  const name = (await screen.findByLabelText('Name')) as HTMLInputElement
  fireEvent.change(name, { target: { value: 'Ada' } })
  return name
}

describe('the desktop workbench', () => {
  it('maximizes the preview in an overlay and restores it without remounting the form', async () => {
    const name = await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Maximize preview' }))
    expect(inOverlay('preview')).toBe(true)
    expect(panels().hasAttribute('inert')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Restore preview' }))
    expect(inOverlay('preview')).toBe(false)
    expect(panels().hasAttribute('inert')).toBe(false)
    expect(screen.getByLabelText('Name')).toBe(name)
    expect(name.value).toBe('Ada')
  })

  it('shows schema and preview in Focus and leaves the rest inert underneath', async () => {
    await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }))
    expect(inOverlay('schema')).toBe(true)
    expect(inOverlay('preview')).toBe(true)
    expect(inOverlay('inspector')).toBe(false)
    expect(panels().hasAttribute('inert')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Exit Focus' }))
    expect(inOverlay('schema')).toBe(false)
  })

  it('makes a collapsed inspector body unreachable', async () => {
    await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }))
    expect(host('inspector').closest('[inert]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Expand inspector' })).toBeTruthy()
  })

  it('collapses the example list to a rail and expands it again', async () => {
    await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse examples' }))
    expect(host('examples').closest('[inert]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand examples' }))
    expect(host('examples').closest('[inert]')).toBeNull()
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

  it('stores no panel size for a maximize or Focus', async () => {
    await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Maximize schema' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore schema' }))
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Exit Focus' }))
    expect(panelKeys()).toEqual([])
  })

  it('moves focus into an overlay and back to the button that opened it', async () => {
    await openWithData()
    const maximize = screen.getByRole('button', { name: 'Maximize preview' })
    maximize.focus()
    fireEvent.click(maximize)
    const restore = screen.getByRole('button', { name: 'Restore preview' })
    expect(document.activeElement).toBe(restore)
    fireEvent.click(restore)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Maximize preview' }))

    const focus = screen.getByRole('button', { name: 'Focus' })
    focus.focus()
    fireEvent.click(focus)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Exit Focus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Exit Focus' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Focus' }))
  })

  it('remembers a collapsed inspector across a reload and forgets it on Reset layout', async () => {
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

with this helper at the top of the file. `test-setup.ts` keeps `MemoryStorage` entries in a private `Map`, so `Object.keys(localStorage)` would return nothing whatever was saved; only `length` and `key(index)` see them. Task 6 proves the other half in a real browser: a keyboard resize does write a size.

```ts
function panelKeys(): string[] {
  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(PANEL_STORAGE_PREFIX)) keys.push(key)
  }
  return keys
}
```

- [x] **Step 3: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/workbench.test.tsx`
Expected: FAIL, no "Maximize preview" button.

- [x] **Step 4: Implement**

`apps/playground/src/workbench/PaneHeader.tsx`:

```tsx
import type { ReactNode, Ref } from 'react'
import type { LayoutAction, PaneId } from './layout.js'

export function PaneHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="pg-pane__header">
      <h2 className="pg-pane__title">{title}</h2>
      {children}
      <div className="pg-pane__actions">{actions}</div>
    </header>
  )
}

// Panel headers always offer Maximize; only the overlay offers Restore, so the
// inert header underneath an overlay never duplicates its button.
export function MaximizeButton({
  pane,
  label,
  maximized,
  dispatch,
  buttonRef,
}: {
  pane: PaneId
  label: string
  maximized: boolean
  dispatch: (action: LayoutAction) => void
  buttonRef?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={buttonRef}
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
import { activeView, panelStorage } from './layout.js'
import type { LayoutAction, LayoutState, PaneId } from './layout.js'
import { PaneSlot } from './pane-hosts.js'
import type { PaneHosts } from './pane-hosts.js'
import { MaximizeButton, PaneHeader } from './PaneHeader.js'

const TITLES: Record<PaneId, string> = { schema: 'Schema', preview: 'Preview', inspector: 'Inspector' }
const INSPECTOR_HEADER_PX = 32
const SAVE = { storage: panelStorage, onlySaveAfterUserInteractions: true } as const

function follow(ref: RefObject<PanelImperativeHandle | null>, expanded: boolean): void {
  const panel = ref.current
  if (!panel) return
  if (expanded && panel.isCollapsed()) panel.expand()
  if (!expanded && !panel.isCollapsed()) panel.collapse()
}

export function Workbench({
  hosts,
  layout,
  dispatch,
  resetSignal,
  previewHeader,
  rail,
}: {
  hosts: PaneHosts
  layout: LayoutState
  dispatch: (action: LayoutAction) => void
  resetSignal: number
  previewHeader?: ReactNode
  rail?: ReactNode
}) {
  const view = activeView(layout)
  const examplesRef = usePanelRef()
  const topRef = usePanelRef()
  const schemaRef = usePanelRef()
  const previewRef = usePanelRef()
  const inspectorRef = usePanelRef()
  const columns = useDefaultLayout({ id: 'columns', ...SAVE })
  const rows = useDefaultLayout({ id: 'rows', ...SAVE })
  const split = useDefaultLayout({ id: 'split', ...SAVE })
  const focusSplit = useDefaultLayout({ id: 'focus-split', ...SAVE })
  const firstReset = useRef(resetSignal)

  const viewKey = view.kind === 'maximized' ? `maximized:${view.pane}` : view.kind
  const shownKey = useRef(viewKey)
  const opener = useRef<HTMLElement | null>(null)
  const overlayAction = useRef<HTMLButtonElement | null>(null)
  // Read during render: after commit the panels are inert and the opener has
  // already lost focus.
  if (viewKey !== shownKey.current && shownKey.current === 'panels') {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  useEffect(() => {
    if (viewKey === shownKey.current) return
    shownKey.current = viewKey
    if (viewKey === 'panels') {
      if (opener.current?.isConnected) opener.current.focus()
      opener.current = null
    } else {
      overlayAction.current?.focus()
    }
  }, [viewKey])

  // A pane shown by an overlay leaves the panels, because a host has one parent.
  const inPanels = (pane: PaneId): boolean =>
    view.kind === 'panels' || (view.kind === 'focus' ? pane === 'inspector' : view.pane !== pane)

  useEffect(() => {
    follow(examplesRef, !layout.examplesCollapsed)
    follow(inspectorRef, !layout.inspectorCollapsed)
  }, [layout.examplesCollapsed, layout.inspectorCollapsed])

  useEffect(() => {
    if (resetSignal === firstReset.current) return
    examplesRef.current?.resize(216)
    topRef.current?.resize('72')
    inspectorRef.current?.resize('28')
    schemaRef.current?.resize('46')
    previewRef.current?.resize('54')
  }, [resetSignal])

  const maximize = (pane: PaneId) => (
    <MaximizeButton pane={pane} label={TITLES[pane].toLowerCase()} maximized={false} dispatch={dispatch} />
  )

  return (
    <div className="pg-workbench">
      {layout.examplesCollapsed && view.kind === 'panels' && (
        <nav className="pg-rail" aria-label="Workbench">
          <button
            type="button"
            className="pg-rail__button"
            aria-label="Expand examples"
            onClick={() => dispatch({ type: 'toggleExamples' })}
          >
            Examples
          </button>
          {rail}
        </nav>
      )}
      <div className="pg-workbench__panels" inert={view.kind !== 'panels'}>
        <Group orientation="horizontal" defaultLayout={columns.defaultLayout} onLayoutChanged={columns.onLayoutChanged}>
          <Panel id="examples" panelRef={examplesRef} defaultSize={216} minSize={160} collapsible collapsedSize={0}>
            <section className="pg-pane" data-pane="examples" aria-label="Examples" inert={layout.examplesCollapsed}>
              <PaneHeader
                title="Examples"
                actions={
                  <button
                    type="button"
                    className="pg-pane__action"
                    aria-label="Collapse examples"
                    onClick={() => dispatch({ type: 'toggleExamples' })}
                  >
                    Collapse
                  </button>
                }
              />
              <PaneSlot host={hosts.examples} />
            </section>
          </Panel>
          <Separator className="pg-separator" aria-label="Resize examples and workspace" />
          <Panel id="main" minSize={600}>
            <Group orientation="vertical" defaultLayout={rows.defaultLayout} onLayoutChanged={rows.onLayoutChanged}>
              <Panel id="top" panelRef={topRef} defaultSize="72">
                <Group orientation="horizontal" defaultLayout={split.defaultLayout} onLayoutChanged={split.onLayoutChanged}>
                  <Panel id="schema" panelRef={schemaRef} defaultSize="46" minSize={280}>
                    <section className="pg-pane" data-pane="schema" aria-label="Schema">
                      <PaneHeader title="Schema" actions={maximize('schema')} />
                      {inPanels('schema') && <PaneSlot host={hosts.schema} />}
                    </section>
                  </Panel>
                  <Separator className="pg-separator" aria-label="Resize schema and preview" />
                  <Panel id="preview" panelRef={previewRef} defaultSize="54" minSize={320}>
                    <section className="pg-pane pg-pane--preview" data-pane="preview" aria-label="Preview">
                      <PaneHeader title="Preview" actions={maximize('preview')}>
                        {previewHeader}
                      </PaneHeader>
                      {inPanels('preview') && <PaneSlot host={hosts.preview} />}
                    </section>
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
                  if (!panel || view.kind !== 'panels') return
                  if (panel.isCollapsed() !== layout.inspectorCollapsed) {
                    dispatch({ type: 'setInspectorCollapsed', collapsed: panel.isCollapsed() })
                  }
                }}
              >
                <section className="pg-pane" data-pane="inspector" aria-label="Inspector">
                  <PaneHeader
                    title="Inspector"
                    actions={
                      <>
                        <button
                          type="button"
                          className="pg-pane__action"
                          aria-label={layout.inspectorCollapsed ? 'Expand inspector' : 'Collapse inspector'}
                          onClick={() => dispatch({ type: 'toggleInspector' })}
                        >
                          {layout.inspectorCollapsed ? 'Expand' : 'Collapse'}
                        </button>
                        {maximize('inspector')}
                      </>
                    }
                  />
                  <div className="pg-pane__body" inert={layout.inspectorCollapsed}>
                    {inPanels('inspector') && <PaneSlot host={hosts.inspector} />}
                  </div>
                </section>
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>

      {view.kind === 'maximized' && (
        <div className="pg-overlay" data-view="maximized">
          <section className="pg-pane" data-pane={view.pane} aria-label={TITLES[view.pane]}>
            <PaneHeader
              title={TITLES[view.pane]}
              actions={
                <MaximizeButton
                  pane={view.pane}
                  label={TITLES[view.pane].toLowerCase()}
                  maximized
                  dispatch={dispatch}
                  buttonRef={overlayAction}
                />
              }
            >
              {view.pane === 'preview' ? previewHeader : null}
            </PaneHeader>
            <PaneSlot host={hosts[view.pane]} />
          </section>
        </div>
      )}

      {view.kind === 'focus' && (
        <div className="pg-overlay" data-view="focus">
          <div className="pg-overlay__bar">
            <span>Focus</span>
            <button
              ref={overlayAction}
              type="button"
              className="pg-pane__action"
              onClick={() => dispatch({ type: 'restore' })}
            >
              Exit Focus
            </button>
          </div>
          <Group orientation="horizontal" defaultLayout={focusSplit.defaultLayout} onLayoutChanged={focusSplit.onLayoutChanged}>
            <Panel id="focus-schema" defaultSize="46" minSize={280}>
              <section className="pg-pane" aria-label="Schema">
                <PaneSlot host={hosts.schema} />
              </section>
            </Panel>
            <Separator className="pg-separator" aria-label="Resize schema and preview in Focus" />
            <Panel id="focus-preview" defaultSize="54" minSize={320}>
              <section className="pg-pane pg-pane--preview" aria-label="Preview">
                <PaneHeader title="Preview">{previewHeader}</PaneHeader>
                <PaneSlot host={hosts.preview} />
              </section>
            </Panel>
          </Group>
        </div>
      )}
    </div>
  )
}
```

`previewHeader` is filled in Task 13 (width presets). The `inspector` panel's `onResize` keeps state in step when a drag collapses it below its minimum.

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

Create `apps/playground/src/workbench/use-narrow-viewport.ts`:

```ts
import { useEffect, useState } from 'react'

// The same query as the phone CSS, so the tree and the stylesheet agree. The
// desktop minimums need 768px, so desktop starts at 820px, with room to spare.
export const NARROW_QUERY = '(max-width: 819px)'

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

In `App.tsx`, `const narrow = useNarrowViewport()`. When `narrow`, render #241's `pg-mobile-workspace` block and the Task 2 `pg-columns` block with its four slots, exactly as they are; otherwise render `<Workbench hosts={hosts} layout={layout} dispatch={dispatchLayout} resetSignal={resetSignal} />`. The portals and the `NotReady` or `FormWorkspace` branch stay outside both trees, so their position in the React tree never changes.

In `schema-editor.test.tsx`, the #241 test "provides a compact mobile panel selector and starts on the preview" now calls `setMediaQuery(NARROW_QUERY, true)` before `render(<App />)` and `resetMediaQueries()` after (both from `../test-setup.js`): the selector exists only on a phone, which is what #241's CSS already showed.

Add to the header nav, before `ThemeSelect`, rendered only when `!narrow`:

```tsx
<button type="button" className="pg-header__button" aria-pressed={layout.focus} onClick={() => dispatchLayout({ type: 'toggleFocus' })}>
  Focus
</button>
<button type="button" className="pg-header__button" onClick={resetLayout}>
  Reset layout
</button>
```

In `playground.css`: change #241's `@media (max-width: 760px)` to `@media (max-width: 819px)`, delete the `@media (max-width: 1100px)` block (the workbench replaces that arrangement), move its `.pg-inspector { height: auto; min-height: 20rem; }` into the 819px block, and add (colors only through `--tx-*` tokens):

```css
.pg-workbench {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.pg-workbench__panels {
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

.pg-rail__button {
  font: inherit;
  font-size: 0.7rem;
  writing-mode: vertical-rl;
  padding: 0.5rem 0;
  color: var(--tx-text-muted);
  background: none;
  border: 0;
  cursor: pointer;
}

.pg-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: auto;
  background: var(--tx-surface);
}

.pg-pane--preview {
  background: var(--tx-surface-raised);
}

.pg-pane__body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.pg-pane .pg-pane-host {
  padding: 0.75rem 1rem;
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

.pg-pane__action,
.pg-header__button {
  font: inherit;
  padding: 0.15rem 0.5rem;
  color: var(--tx-text-muted);
  background: none;
  border: 1px solid transparent;
  border-radius: var(--tx-radius);
  cursor: pointer;
}

.pg-pane__action:hover,
.pg-pane__action:focus-visible,
.pg-header__button:hover,
.pg-header__button:focus-visible,
.pg-header__button[aria-pressed='true'] {
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

.pg-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  background: var(--tx-bg);
}

.pg-overlay__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.75rem;
  font-size: 0.8rem;
  color: var(--tx-text-muted);
  border-bottom: 1px solid var(--tx-border);
}
```

- [x] **Step 5: Run the playground project**

Run: `pnpm vitest run --project playground`
Expected: PASS, including every #241 test.

- [x] **Step 6: Commit**

```bash
git add apps/playground pnpm-lock.yaml
git commit -m "feat(playground): resizable desktop workbench with Maximize and Focus overlays"
```

### Task 4: The breakpoint keeps everything

Task 3 already chooses the tree by width. This task pins Contract 1 across that choice.

**Files:**
- Test: `apps/playground/src/__tests__/breakpoint.test.tsx`
- Modify: `apps/playground/src/App.tsx` only if a test below fails

**Interfaces:**
- Consumes: `NARROW_QUERY` (Task 3), `setMediaQuery` and `resetMediaQueries` from `test-setup.ts`.

- [x] **Step 1: Write the tests**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { App } from '../App.js'
import { resetMediaQueries, setMediaQuery } from '../test-setup.js'
import { NARROW_QUERY } from '../workbench/use-narrow-viewport.js'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

afterEach(() => {
  cleanup()
  resetMediaQueries()
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('crossing the phone breakpoint', () => {
  it('keeps the form, its data and the schema editor element', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Ada' } })
    const editor = screen.getByLabelText(/^JSON Schema/)

    act(() => setMediaQuery(NARROW_QUERY, true))
    expect(document.querySelector('.pg-workbench')).toBeNull()
    expect(document.querySelector('.pg-columns')).not.toBeNull()
    expect(screen.getByLabelText('Name')).toBe(name)
    expect(name.value).toBe('Ada')
    expect(screen.getByLabelText(/^JSON Schema/)).toBe(editor)

    act(() => setMediaQuery(NARROW_QUERY, false))
    expect(document.querySelector('.pg-workbench')).not.toBeNull()
    expect(screen.getByLabelText('Name')).toBe(name)
  })

  it('shows #241 phone controls only on a phone', async () => {
    render(<App />)
    await screen.findByLabelText('Name')
    expect(screen.queryByRole('group', { name: 'Playground panels' })).toBeNull()
    act(() => setMediaQuery(NARROW_QUERY, true))
    expect(screen.getByRole('group', { name: 'Playground panels' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Focus' })).toBeNull()
  })
})
```

- [x] **Step 2: Run them**

Run: `pnpm vitest run --project playground src/__tests__/breakpoint.test.tsx`
Expected: PASS. A failure means a portal or the `FormWorkspace` branch moved inside one of the two trees in Task 3; move it back outside both, rather than changing the test.

- [x] **Step 3: Commit**

```bash
git add apps/playground/src
git commit -m "test(playground): pin that crossing the phone breakpoint remounts nothing"
```

### Task 5: Status bar

**Files:**
- Create: `apps/playground/src/workbench/StatusBar.tsx`
- Create: `apps/playground/src/workbench/dialect-label.ts`
- Modify: `apps/playground/src/App.tsx`, `apps/playground/src/playground.css`
- Test: `apps/playground/src/__tests__/status-bar.test.tsx`

**Interfaces:**
- Produces: `dialectLabel(schema: unknown): string`; `StatusBar` props `{ dialect: string; parseError: string | null; pending: boolean; schemaIssues?: number | null; cursor?: { line: number; column: number } | null; hint?: ReactNode }`. PR 2 fills `schemaIssues` and `cursor`; PR 4 fills `hint`.

- [x] **Step 1: Write the failing tests**

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
    fireEvent.change(screen.getByLabelText(/^JSON Schema/), { target: { value: '{' } })
    expect(status.textContent).toContain('JSON error')
  })
})
```

- [x] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/status-bar.test.tsx`
Expected: FAIL, cannot resolve `dialect-label.js`.

- [x] **Step 3: Implement**

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
      {schemaIssues !== null && <span>{schemaIssues === 1 ? '1 schema error' : `${schemaIssues} schema errors`}</span>}
      <span className="pg-status__end">
        {cursor && `Ln ${cursor.line}, Col ${cursor.column}`}
        {hint}
      </span>
    </footer>
  )
}
```

In `App.tsx`, render `<StatusBar dialect={dialectLabel(appliedSchema)} parseError={parseError} pending={draftHasChanges} />` as the last child of `.pg-app` when `!narrow`.

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

- [x] **Step 4: Run the playground project**

Run: `pnpm vitest run --project playground`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/playground/src
git commit -m "feat(playground): status bar with dialect and JSON state"
```

### Task 6: Browser checks for the shell

**Files:**
- Modify: `vitest.config.ts` (exclude browser tests from `playground`; add `playground-browser`)
- Create: `apps/playground/src/__tests__/workbench.browser.test.tsx`

**Interfaces:**
- Consumes: the shell from Tasks 1 to 5; `THEME_STORAGE_KEY` from `theme.config.mjs`.

- [x] **Step 1: Configure the project**

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

- [x] **Step 2: Write the browser tests**

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { page, userEvent } from '@vitest/browser/context'
import { THEME_STORAGE_KEY } from '../../../../theme.config.mjs'
import { App } from '../App.js'
import { PANEL_STORAGE_PREFIX } from '../workbench/layout.js'

const SIZES = [
  [1512, 900],
  [1024, 768],
  [820, 800],
  [819, 800],
  [390, 844],
] as const

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function paneWidth(id: string): number {
  return document.querySelector(`[data-pane="${id}"]`)!.getBoundingClientRect().width
}

function panelKeys(): string[] {
  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(PANEL_STORAGE_PREFIX)) keys.push(key)
  }
  return keys
}

async function toPhoneAndBack(): Promise<void> {
  await page.viewport(390, 844)
  await waitFor(() => {
    expect(document.querySelector('.pg-workbench')).toBeNull()
    expect(document.querySelector('.pg-columns [data-pane-host="preview"]')).not.toBeNull()
  })
  await page.viewport(1512, 900)
  await waitFor(() => expect(document.querySelector('.pg-workbench [data-pane-host="preview"]')).not.toBeNull())
}

describe.each(['light', 'dark'] as const)('the playground in %s', (theme) => {
  for (const [width, height] of SIZES) {
    it(`fits ${width}x${height} without horizontal scrolling`, async () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
      await page.viewport(width, height)
      render(<App />)
      await screen.findByLabelText('Name')
      await waitFor(() => expect(document.documentElement.dataset.theme).toBe(theme))
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
      if (width >= 820) {
        expect(paneWidth('schema')).toBeGreaterThanOrEqual(280)
        expect(paneWidth('preview')).toBeGreaterThanOrEqual(320)
      } else {
        expect(screen.getByRole('group', { name: 'Playground panels' })).toBeTruthy()
      }
    })
  }
})

describe('the desktop workbench in Chromium', () => {
  it('resizes from the keyboard, saves that size, and restores it exactly after Maximize', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await screen.findByLabelText('Name')
    const before = paneWidth('schema')
    screen.getByRole('separator', { name: 'Resize schema and preview' }).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    const schema = paneWidth('schema')
    const preview = paneWidth('preview')
    expect(schema).toBeGreaterThan(before + 10)
    await waitFor(() => expect(panelKeys().length).toBeGreaterThan(0))

    fireEvent.click(screen.getByRole('button', { name: 'Maximize preview' }))
    expect(document.querySelector('.pg-overlay')!.getBoundingClientRect().width).toBeGreaterThan(1000)
    fireEvent.click(screen.getByRole('button', { name: 'Restore preview' }))
    expect(paneWidth('schema')).toBeCloseTo(schema, 0)
    expect(paneWidth('preview')).toBeCloseTo(preview, 0)

    cleanup()
    render(<App />)
    await screen.findByLabelText('Name')
    expect(paneWidth('schema')).toBeCloseTo(schema, 0)
  })

  it('keeps typed data across the breakpoint in both directions', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement
    await userEvent.fill(name, 'Ada')
    await toPhoneAndBack()
    expect(screen.getByLabelText('Name')).toBe(name)
    expect(name.value).toBe('Ada')
  })

  for (const renderer of ['default', 'bootstrap'] as const) {
    it(`submits once with ${renderer} from the Maximize overlay and after a breakpoint crossing`, async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      await page.viewport(1512, 900)
      render(<App />)
      fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
      fireEvent.change(screen.getByLabelText(/renderer/i), { target: { value: renderer } })
      await screen.findByRole('region', { name: renderer === 'default' ? 'Rendered by React · Default' : 'Rendered by React · Bootstrap 5' })

      fireEvent.click(screen.getByRole('button', { name: 'Maximize preview' }))
      fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }))
      await screen.findByText('Submitted successfully.', {}, { timeout: 3000 })
      expect(log.mock.calls.filter(([first]) => first === 'Submitted:')).toHaveLength(1)
      fireEvent.click(screen.getByRole('button', { name: 'Restore preview' }))

      await toPhoneAndBack()
      fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }))
      await waitFor(() => expect(log.mock.calls.filter(([first]) => first === 'Submitted:')).toHaveLength(2), {
        timeout: 3000,
      })
    })
  }
})
```

The submission checks count `console.log('Submitted:', data)` calls because that is what `FormWorkspace`'s `onSubmit` does on `main`; if that log changes, count whatever `onSubmit` records instead.

- [x] **Step 3: Run the browser project**

Run: `pnpm vitest run --project playground-browser`
Expected: PASS, 14 tests. Playwright's Chromium comes with the root `playwright` dev dependency; run `pnpm exec playwright install chromium` if the runner reports it missing.

- [x] **Step 4: Commit and open the pull request**

```bash
git add vitest.config.ts apps/playground/src/__tests__/workbench.browser.test.tsx
git commit -m "test(playground): check the workbench and the breakpoint in Chromium"
```

Run `pnpm build && pnpm typecheck && pnpm test && pnpm site:build`, push, and open the pull request referencing #239. After merge, on the live site at 1512x900, 1024x768, 820x800 and a phone: drag a separator, maximize and restore, Focus, collapse the inspector and the example list, reload, Reset layout, and resize the window across 820px.

---

## PR 2: CodeMirror editor with schema checking, completed in #247

The implementation below is historical. Its code snippets are superseded by the merged implementation in [#247](https://github.com/texaryn/texaryn/pull/247). The current source on `main` is authoritative. Task 11's HTML-regex examples do not describe the manifest-based size checker that shipped.

Branch `feat/playground-code-editor`, from `main` after PR 1 merges.

### Task 7: `checkSchema` in `@texaryn/schema-json`

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

- [x] **Step 1: Write the failing tests**

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

  it('accepts a valid schema and detects draft-07', async () => {
    expect(
      await checkSchema({
        $schema: D2020,
        type: 'object',
        properties: { tags: { type: 'array', prefixItems: [{ type: 'string' }] } },
        $defs: { x: { type: 'number' } },
        required: ['tags'],
      }),
    ).toEqual([])
    expect(
      await pointers({ $schema: 'http://json-schema.org/draft-07/schema#', properties: { a: { type: 'strin' } } }),
    ).toEqual(['/properties/a/type'])
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
  it('uses the only split that matches the document', () => {
    const document = { properties: { 'a/b': { minLength: 1 } } }
    expect(resolveUnescapedPath(document, '/properties/a/b/minLength')).toBe('/properties/a~1b/minLength')
  })

  it('stops at the shared prefix when two splits match', () => {
    const document = {
      properties: {
        'a/properties/b': { type: 'string' },
        a: { properties: { b: { type: 'strin' } } },
      },
    }
    expect(resolveUnescapedPath(document, '/properties/a/properties/b/type')).toBe('/properties')
  })

  it('handles names with ~ and names that look like indices', () => {
    expect(resolveUnescapedPath({ 'x~y': { 0: true } }, '/x~y/0')).toBe('/x~0y/0')
  })

  it('claims only the root when there are more readings than it examines', () => {
    // Each level holds `a` (one segment) and `a/a` (two), so the path `a`
    // repeated ten times has 89 readings, past the cap of 32.
    const levels: unknown[] = [{ end: true }, { a: { end: true } }]
    while (levels.length <= 10) levels.push({ a: levels.at(-1), 'a/a': levels.at(-2) })
    const path = `/${Array.from({ length: 10 }, () => 'a').join('/')}/end`
    expect(resolveUnescapedPath(levels.at(-1), path)).toBe('')
  })

  it('keeps an unknown path as it is', () => {
    expect(resolveUnescapedPath({}, '/missing/x')).toBe('/missing/x')
  })

  it('maps the root to the empty pointer', () => {
    expect(resolveUnescapedPath({}, '')).toBe('')
  })
})
```

- [x] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project schema-json src/__tests__/check-schema.test.ts`
Expected: FAIL, `checkSchema` is not exported.

- [x] **Step 3: Implement**

`packages/schema-json/src/schema-issues.ts`:

```ts
import type { JsonError } from '@texaryn/json-schema-library'
import type { JsonPointer } from '@texaryn/core'
import type { SchemaIssue } from './types.js'

const MAX_READINGS = 32

function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

interface Search {
  found: string[][]
  truncated: boolean
}

function readings(node: unknown, parts: readonly string[], start: number, prefix: readonly string[], search: Search): void {
  if (search.found.length >= MAX_READINGS) {
    search.truncated = true
    return
  }
  if (start === parts.length) {
    search.found.push([...prefix])
    return
  }
  if (node === null || typeof node !== 'object') return
  for (let end = start + 1; end <= parts.length; end += 1) {
    const key = parts.slice(start, end).join('/')
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      readings((node as Record<string, unknown>)[key], parts, end, [...prefix, key], search)
    }
  }
}

function sharedPrefix(paths: readonly string[][]): string[] {
  const shared: string[] = []
  for (let index = 0; paths.every((path) => index < path.length && path[index] === paths[0]![index]); index += 1) {
    shared.push(paths[0]![index]!)
  }
  return shared
}

// json-schema-library joins property names into its locations without RFC 6901
// escaping (#184), so `a/b` and nested `a` then `b` print alike. The document
// decides: one matching reading is exact; several mean the location is
// ambiguous, and only the prefix every reading shares is certain. Past the cap
// the unseen readings could diverge anywhere, so only the root is certain.
export function resolveUnescapedPath(document: unknown, path: string): string {
  const parts = path === '' ? [] : path.split('/').slice(1)
  const search: Search = { found: [], truncated: false }
  readings(document, parts, 0, [], search)
  if (search.truncated) return ''
  const { found } = search
  const segments = found.length === 0 ? parts : found.length === 1 ? found[0]! : sharedPrefix(found)
  return segments.map((segment) => `/${escapeSegment(segment)}`).join('')
}

export function toSchemaIssue(document: unknown, error: JsonError): SchemaIssue {
  const data = (error.data ?? {}) as { pointer?: unknown; message?: unknown }
  const location = typeof data.pointer === 'string' ? data.pointer.replace(/^#/, '') : ''
  return {
    pointer: resolveUnescapedPath(document, location) as JsonPointer,
    code: String(error.code),
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

In `adapter.ts`, move the first steps of `createAdapter` into one function both callers use, so the checker never compiles differently from the adapter:

```ts
async function prepareValidation(schema: unknown, config: AdapterConfig | undefined) {
  const dialect = detectDialect(schema, {
    defaultDialect: config?.defaultDialect ?? 'draft-07',
  })
  if (config?.dynamicReferenceProjection === 'local' && isPre2019Dialect(dialect)) {
    throw new TypeError('Local dynamic reference projection requires Draft 2019-09 or Draft 2020-12.')
  }
  // json-schema-library carries no metaschema documents, so a schema referencing its own fails closed.
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

`createAdapter` then starts with `const { dialect, externalRemotes, metaschemas, remotes, graph, validated } = await prepareValidation(schema, config)` and drops its own copies of those lines, its later `rejectSameLocationCycles(graph)` call and its `const validated = …` line. Everything after stays in its current order.

`index.ts`:

```ts
export { createJsonSchemaAdapter, checkSchema } from './adapter.js'
export type { AdapterConfig, SchemaIssue } from './types.js'
```

`.changeset/schema-json-check-schema.md`:

```md
---
'@texaryn/schema-json': minor
---

Adds `checkSchema`, which reports where a schema itself is invalid. It runs the same preparation as `createJsonSchemaAdapter` and returns RFC 6901 pointers into the schema, escaping property names that contain `/` or `~`, and stopping at the shared prefix when the library's location is ambiguous.
```

- [x] **Step 4: Run the schema-json suite**

Run: `pnpm vitest run --project schema-json`
Expected: PASS, every existing test plus 12 new ones. A changed existing result means the extraction altered the adapter; fix that before going on.

- [x] **Step 5: Regenerate the API docs**

Run: `pnpm build && pnpm docs`
Expected: `docs/api` gains `checkSchema` and `SchemaIssue`.

- [x] **Step 6: Commit**

```bash
git add packages/schema-json .changeset/schema-json-check-schema.md docs/api
git commit -m "feat(schema-json): add checkSchema for locating invalid schema keywords"
```

### Task 8: From a pointer to a place in the editor

**Files:**
- Modify: `apps/playground/package.json` (`pnpm --filter @texaryn/playground add -E @codemirror/state @codemirror/view @codemirror/language @codemirror/commands @codemirror/search @codemirror/autocomplete @codemirror/lint @codemirror/lang-json @lezer/common @lezer/highlight @lezer/json`)
- Create: `apps/playground/src/editor/pointer-range.ts`
- Test: `apps/playground/src/__tests__/pointer-range.test.ts`

**Interfaces:**
- Produces: `interface TextRange { from: number; to: number }`, `rangeForPointer(tree: Tree, doc: string, pointer: string): TextRange`.

- [x] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { parser } from '@lezer/json'
import { rangeForPointer } from '../editor/pointer-range.js'

const doc = JSON.stringify(
  {
    type: 'object',
    properties: { name: { type: 'strin' }, 'a/b': { minLength: '3' }, 'c~d': { type: 'x' } },
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

  it('unescapes ~1 and ~0 in property names', () => {
    expect(textAt('/properties/a~1b/minLength')).toBe('"3"')
    expect(textAt('/properties/c~0d/type')).toBe('"x"')
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

- [x] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/pointer-range.test.ts`
Expected: FAIL, cannot resolve `../editor/pointer-range.js`.

- [x] **Step 3: Implement `apps/playground/src/editor/pointer-range.ts`**

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

- [x] **Step 4: Run to verify they pass**

Run: `pnpm vitest run --project playground src/__tests__/pointer-range.test.ts`
Expected: PASS, 6 tests.

- [x] **Step 5: Commit**

```bash
git add apps/playground/package.json pnpm-lock.yaml apps/playground/src/editor/pointer-range.ts apps/playground/src/__tests__/pointer-range.test.ts
git commit -m "feat(playground): map schema pointers to editor ranges"
```

### Task 9: Keyword autocomplete

**Files:**
- Create: `apps/playground/src/editor/keywords.ts`
- Create: `apps/playground/src/editor/completion.ts`
- Test: `apps/playground/src/__tests__/completion.test.ts`

**Interfaces:**
- Produces: `type EditorDialect = 'draft-04' | 'draft-07' | '2019-09' | '2020-12'`, `interface KeywordInfo { name: string; detail: string }`, `keywordsFor(dialect: EditorDialect): readonly KeywordInfo[]`, `dialectOf(text: string): EditorDialect`, `TYPE_VALUES`, `SCHEMA_URIS`, `FORMATS`, `NAME_MAPS`, `schemaCompletionSource(context: CompletionContext): CompletionResult | null`.

- [x] **Step 1: Write the failing tests**

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

- [x] **Step 2: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/completion.test.ts`
Expected: FAIL, cannot resolve `../editor/completion.js`.

- [x] **Step 3: Implement**

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

- [x] **Step 4: Run to verify they pass**

Run: `pnpm vitest run --project playground src/__tests__/completion.test.ts`
Expected: PASS, 5 tests. If the "property names" case completes inside `properties`, print `syntaxTree(state).resolveInner(pos, -1)` and its parents for that document and adjust `enclosingKey` to the node the parser actually recovers; do not loosen the test.

- [x] **Step 5: Commit**

```bash
git add apps/playground/src/editor/keywords.ts apps/playground/src/editor/completion.ts apps/playground/src/__tests__/completion.test.ts
git commit -m "feat(playground): complete JSON Schema keywords for the declared dialect"
```

### Task 10: The CodeMirror schema editor

**Files:**
- Create: `apps/playground/src/editor/theme.ts`
- Create: `apps/playground/src/editor/schema-lint.ts`
- Create: `apps/playground/src/editor/SchemaEditor.tsx` (default export, the lazy chunk)
- Create: `apps/playground/src/editor-slot.tsx` (in the main bundle)
- Create: `apps/playground/src/__tests__/schema-text.ts` (test helpers)
- Modify: `apps/playground/src/App.tsx` (the schema content uses `SchemaEditorSlot`; Format and Copy; status bar inputs; load gate)
- Modify: `apps/playground/src/playground.css` (`--tx-code-*` tokens, `.pg-code-editor`)
- Modify: `apps/playground/src/test-setup.ts` (`Range` geometry stubs)
- Modify: every test that reads or changes the schema through `getByLabelText(/^JSON Schema/)` as a textarea: `schema-editor.test.tsx`, `inspector.test.tsx`, `form-builder.test.tsx`, `status-bar.test.tsx`, `breakpoint.test.tsx`
- Modify: `apps/playground/src/__tests__/workbench.browser.test.tsx`
- Test: `apps/playground/src/__tests__/code-editor.test.tsx`, `apps/playground/src/__tests__/schema-lint.test.ts`

**Interfaces:**
- Consumes: `checkSchema` (Task 7), `rangeForPointer` (Task 8), `schemaCompletionSource` (Task 9), `StatusBar` `schemaIssues` and `cursor` (Task 5).
- Produces: `interface SchemaEditorProps { value: string; onChange: (text: string) => void; labelledBy: string; documentKey: number; onSchemaIssues?: (count: number | null) => void; onCursor?: (cursor: { line: number; column: number } | null) => void }`, `SchemaEditorSlot(props: SchemaEditorProps & { load: boolean })`, `schemaLintSource(onCount: (count: number | null) => void): (view: EditorView) => Promise<Diagnostic[]>`, test helpers `readSchemaText(): string` and `editSchema(text: string): void`.

- [x] **Step 1: Add the `Range` stubs to `test-setup.ts`**

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

- [x] **Step 2: Add the test helpers and move existing tests onto them**

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

// Replaces the whole document. Tests of state use it; tests of typing use a
// real browser in workbench.browser.test.tsx.
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

Replace every `getByLabelText(/^JSON Schema/) as HTMLTextAreaElement` followed by `.value` or `fireEvent.change` in the files listed above with `readSchemaText()` and `editSchema(text)`. Where a test asserts the element's identity, as `breakpoint.test.tsx` does, keep `screen.getByLabelText(/^JSON Schema/)`: with CodeMirror it returns the editor's content element, which must also survive the crossing.

- [x] **Step 3: Write the failing tests**

`apps/playground/src/__tests__/code-editor.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { forEachDiagnostic } from '@codemirror/lint'
import { undo, undoDepth } from '@codemirror/commands'
import { App } from '../App.js'
import { resetMediaQueries, setMediaQuery } from '../test-setup.js'
import { NARROW_QUERY } from '../workbench/use-narrow-viewport.js'
import { editSchema, readSchemaText } from './schema-text.js'

afterEach(() => {
  cleanup()
  resetMediaQueries()
})

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

  it('underlines an invalid keyword value and counts it in the status bar', async () => {
    await openStringField()
    editSchema(readSchemaText().replace('"type": "string"', '"type": "strin"'))
    await waitFor(() => expect(diagnostics().map((entry) => entry.text)).toContain('"strin"'), { timeout: 3000 })
    expect(screen.getByRole('contentinfo', { name: 'Status' }).textContent).toContain('1 schema error')
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

  it('makes Format undoable and starts a fresh history for another example', async () => {
    await openStringField()
    const minified = JSON.stringify(JSON.parse(readSchemaText()))
    editSchema(minified)
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    expect(readSchemaText()).toContain('\n  "type"')
    act(() => {
      undo(view())
    })
    expect(readSchemaText()).toBe(minified)
    fireEvent.click(screen.getByRole('button', { name: 'Number field' }))
    await waitFor(() => expect(readSchemaText()).toContain('Price'))
    expect(undoDepth(view().state)).toBe(0)
  })

  it('stays mounted while the visual builder shows', async () => {
    await openStringField()
    const editor = document.querySelector('.cm-editor')
    fireEvent.click(screen.getByRole('button', { name: 'Visual' }))
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    expect(document.querySelector('.cm-editor')).toBe(editor)
  })

  it('loads on a phone only when the Schema view first opens', async () => {
    setMediaQuery(NARROW_QUERY, true)
    render(<App />)
    await screen.findByLabelText('Name')
    expect(document.querySelector('.cm-editor')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Schema$/ }))
    await waitFor(() => expect(document.querySelector('.cm-editor')).toBeTruthy())
  })
})
```

`Price` is the field title in the Number field example (`packages/examples/src/basics/primitives.ts`), so its presence proves the switch landed.

`apps/playground/src/__tests__/schema-lint.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { json } from '@codemirror/lang-json'

const pending: ((issues: { pointer: string; code: string; message: string }[]) => void)[] = []

vi.mock('@texaryn/schema-json', () => ({
  checkSchema: () => new Promise((resolve) => pending.push(resolve)),
}))

const { schemaLintSource } = await import('../editor/schema-lint.js')

describe('schemaLintSource', () => {
  it('drops the count of a check the document has outrun', async () => {
    const counts: (number | null)[] = []
    const source = schemaLintSource((count) => counts.push(count))
    const view = { state: EditorState.create({ doc: '{"type":"strin"}', extensions: [json()] }) } as { state: EditorState }

    const first = source(view as unknown as EditorView)
    view.state = EditorState.create({ doc: '{"type":"x","minLength":"3"}', extensions: [json()] })
    const second = source(view as unknown as EditorView)

    pending[1]!([
      { pointer: '/type', code: 'schema-error', message: 'a' },
      { pointer: '/minLength', code: 'schema-error', message: 'b' },
    ])
    await second
    pending[0]!([{ pointer: '/type', code: 'schema-error', message: 'c' }])
    await first

    expect(counts).toEqual([2])
  })
})
```

- [x] **Step 4: Run to verify they fail**

Run: `pnpm vitest run --project playground src/__tests__/code-editor.test.tsx src/__tests__/schema-lint.test.ts`
Expected: FAIL, no `.cm-editor` and no `schema-lint.js`.

- [x] **Step 5: Implement**

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
  let generation = 0
  return async (view: EditorView): Promise<Diagnostic[]> => {
    const current = ++generation
    const doc = view.state.doc
    const text = doc.toString()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      onCount(null)
      return []
    }
    const tree = ensureSyntaxTree(view.state, doc.length, 200) ?? syntaxTree(view.state)
    let diagnostics: Diagnostic[]
    try {
      const issues = await checkSchema(parsed)
      diagnostics = issues.map((issue) => ({
        ...rangeForPointer(tree, text, issue.pointer),
        severity: 'error' as const,
        message: issue.message,
        source: 'JSON Schema',
      }))
    } catch (error) {
      diagnostics = [
        {
          from: 0,
          to: Math.min(1, text.length),
          severity: 'error' as const,
          message: error instanceof Error ? error.message : String(error),
          source: 'Texaryn',
        },
      ]
    }
    // CodeMirror drops diagnostics for an outdated document; the count is ours to drop.
    if (current === generation && view.state.doc === doc) onCount(diagnostics.length)
    return diagnostics
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
import { PANE_ATTACH_EVENT } from '../workbench/pane-hosts.js'
import { editorHighlight, editorTheme } from './theme.js'
import { schemaLintSource } from './schema-lint.js'
import { schemaCompletionSource } from './completion.js'

export interface SchemaEditorProps {
  value: string
  onChange: (text: string) => void
  labelledBy: string
  documentKey: number
  onSchemaIssues?: (count: number | null) => void
  onCursor?: (cursor: { line: number; column: number } | null) => void
}

export default function SchemaEditor({
  value,
  onChange,
  labelledBy,
  documentKey,
  onSchemaIssues,
  onCursor,
}: SchemaEditorProps) {
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
    // The pane host moves between layouts without remounting this view, so its
    // cached geometry has to be refreshed when it lands somewhere new.
    const paneHost = host.current!.closest('.pg-pane-host')
    const remeasure = () => editor.requestMeasure()
    paneHost?.addEventListener(PANE_ATTACH_EVENT, remeasure)
    return () => {
      paneHost?.removeEventListener(PANE_ATTACH_EVENT, remeasure)
      editor.destroy()
      view.current = null
    }
  }, [labelledBy])

  // Another example is another document: undo must not cross into it.
  const firstKey = useRef(documentKey)
  useEffect(() => {
    const editor = view.current
    if (!editor || documentKey === firstKey.current) return
    firstKey.current = documentKey
    editor.setState(EditorState.create({ doc: value, extensions: extensions.current }))
  }, [documentKey])

  // Format and the visual builder change the same document: an undoable edit.
  useEffect(() => {
    const editor = view.current
    if (!editor) return
    const current = editor.state.doc.toString()
    if (current !== value) editor.dispatch({ changes: { from: 0, to: current.length, insert: value } })
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

// `load` turns true the first time the schema pane is visible and stays true.
// Until then, and for good if the chunk fails, the textarea is the editor.
export function SchemaEditorSlot({ load, ...props }: SchemaEditorProps & { load: boolean }) {
  const plain = <PlainEditor {...props} />
  if (!load) return plain
  return (
    <EditorBoundary fallback={plain}>
      <Suspense fallback={plain}>
        <SchemaEditor {...props} />
      </Suspense>
    </EditorBoundary>
  )
}
```

In `App.tsx`:

```tsx
const [schemaIssues, setSchemaIssues] = useState<number | null>(null)
const [cursor, setCursor] = useState<{ line: number; column: number } | null>(null)
const [loadEditor, setLoadEditor] = useState(false)
useEffect(() => {
  if (!narrow || mobilePanel === 'schema') setLoadEditor(true)
}, [narrow, mobilePanel])
```

In the schema content, keep the editor mounted while the visual builder shows:

```tsx
<div id="schema-editor-panel">
  {schemaMode === 'visual' && <FormBuilder schemaText={schemaText} onSchemaChange={handleSchemaChange} />}
  <div hidden={schemaMode === 'visual'} className="pg-code-editor-frame">
    <SchemaEditorSlot
      load={loadEditor}
      value={schemaText}
      onChange={handleSchemaChange}
      labelledBy="schema-editor-label"
      documentKey={exampleRevision}
      onSchemaIssues={setSchemaIssues}
      onCursor={setCursor}
    />
  </div>
</div>
```

Next to the existing Reset data button in `pg-schema-heading`:

```tsx
{parseError === null && (
  <button
    type="button"
    className="pg-button pg-button--quiet"
    onClick={() => handleSchemaChange(JSON.stringify(JSON.parse(schemaText), null, 2))}
  >
    Format
  </button>
)}
<button type="button" className="pg-button pg-button--quiet" onClick={() => void navigator.clipboard?.writeText(schemaText)}>
  Copy
</button>
```

and pass `schemaIssues={schemaIssues}` and `cursor={cursor}` to `StatusBar`.

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
.pg-code-editor-frame,
.pg-code-editor {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 220px;
  overflow: hidden;
  border: 1px solid var(--tx-border);
  border-radius: var(--tx-radius);
}

.pg-code-editor-frame[hidden] {
  display: none;
}
```

- [x] **Step 6: Add the browser checks to `workbench.browser.test.tsx`**

```tsx
const MOD = navigator.platform.includes('Mac') ? 'Meta' : 'Control'

describe('the schema editor in Chromium', () => {
  it('draws an underline under an invalid keyword value', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    await waitFor(() => expect(document.querySelector('.cm-editor')).toBeTruthy())
    editSchema(readSchemaText().replace('"type": "string"', '"type": "strin"'))
    await waitFor(() => expect(document.querySelector('.cm-lintRange-error')?.textContent).toBe('"strin"'), {
      timeout: 3000,
    })
  })

  it('takes real typing, undoes it, and lets Tab leave', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await waitFor(() => expect(document.querySelector('.cm-content')).toBeTruthy())
    const content = document.querySelector<HTMLElement>('.cm-content')!
    await userEvent.click(content)
    await userEvent.keyboard('{End} ')
    const typed = readSchemaText()
    await userEvent.keyboard(`{${MOD}>}z{/${MOD}}`)
    expect(readSchemaText()).not.toBe(typed)
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement?.closest('.cm-editor')).toBeNull()
  })

  it('keeps the same editor, its undo history and its click positions across the breakpoint', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await waitFor(() => expect(document.querySelector('.cm-content')).toBeTruthy())
    const editor = document.querySelector('.cm-editor')
    const before = readSchemaText()
    await userEvent.click(document.querySelector<HTMLElement>('.cm-content')!)
    await userEvent.keyboard('{End} ')
    await toPhoneAndBack()
    expect(document.querySelector('.cm-editor')).toBe(editor)
    await userEvent.click(document.querySelectorAll<HTMLElement>('.cm-line')[2]!)
    await waitFor(() =>
      expect(screen.getByRole('contentinfo', { name: 'Status' }).textContent).toContain('Ln 3,'),
    )
    await userEvent.keyboard(`{${MOD}>}z{/${MOD}}`)
    expect(readSchemaText()).toBe(before)
  })
})
```

with `waitFor` added to the `@testing-library/react` import and `editSchema`, `readSchemaText` imported from `./schema-text.js`.

- [x] **Step 7: Run both playground projects**

Run: `pnpm vitest run --project playground && pnpm vitest run --project playground-browser`
Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add apps/playground/src
git commit -m "feat(playground): CodeMirror schema editor checked by checkSchema"
```

### Task 11: Size limits

**Files:**
- Modify: `apps/playground/vite.config.ts` (`manualChunks`)
- Create: `scripts/check-playground-size.mjs`
- Test: `scripts/check-playground-size.test.mjs`
- Modify: `package.json` (`site:build`)

**Interfaces:**
- Produces: `LIMITS`, `gzipSize(source: Buffer | string): number`, `initialScripts(html: string): string[]`, `measure({ html, assets, read }): { initial: number; editor: number; palette: number }`, `overLimit(sizes, limits?): string[]`, `eagerChunks(manifest): string[]`, `lazyLeaks(manifest): string[]`.

- [x] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { initialScripts, lazyLeaks, measure, overLimit, LIMITS } from './check-playground-size.mjs'

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

  it('finds a lazy chunk the entry imports statically', () => {
    const lazy = {
      'index.html': { file: 'assets/index-a.js', isEntry: true, imports: ['_vendor.js'], dynamicImports: ['src/editor/SchemaEditor.tsx'] },
      '_vendor.js': { file: 'assets/vendor-b.js' },
      'src/editor/SchemaEditor.tsx': { file: 'assets/editor-c.js' },
    }
    expect(lazyLeaks(lazy)).toEqual([])
    const leaked = { ...lazy, '_vendor.js': { file: 'assets/vendor-b.js', imports: ['src/editor/SchemaEditor.tsx'] } }
    expect(lazyLeaks(leaked)).toEqual(['assets/editor-c.js'])
  })
})
```

- [x] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --project scripts check-playground-size`
Expected: FAIL, module not found.

- [x] **Step 3: Implement `scripts/check-playground-size.mjs`**

```js
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

export const LIMITS = { initial: 175 * 1024, editor: 150 * 1024, palette: 25 * 1024 }

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

// Every file the entry pulls in without a dynamic import, from Vite's manifest.
export function eagerChunks(manifest) {
  const seen = new Set()
  const visit = (chunk) => {
    if (!chunk || seen.has(chunk.file)) return
    seen.add(chunk.file)
    for (const key of chunk.imports ?? []) visit(manifest[key])
  }
  visit(Object.values(manifest).find((chunk) => chunk.isEntry))
  return [...seen]
}

export function lazyLeaks(manifest) {
  return eagerChunks(manifest).filter((file) => /(^|\/)(editor|palette)-[^/]*\.js$/.test(file))
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
  const leaks = lazyLeaks(JSON.parse(readFileSync(join(root, '.vite', 'manifest.json'), 'utf8')))
  if (leaks.length > 0) {
    console.error(`check-playground-size: loaded on first visit but meant to be lazy: ${leaks.join(', ')}`)
    process.exit(1)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv[2] ?? 'apps/playground/dist')
```

- [x] **Step 4: Name the lazy chunks in `apps/playground/vite.config.ts`**

Add to the returned config, leaving #241's renderer chunks to Vite's defaults. `manifest: true` writes `dist/.vite/manifest.json`, which the check reads to prove the lazy chunks stay lazy:

```ts
build: {
  manifest: true,
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

- [x] **Step 5: Wire it into `site:build`**

In the root `package.json`, insert `&& node scripts/check-playground-size.mjs apps/playground/dist` directly after `pnpm --filter @texaryn/playground build:pages`.

- [x] **Step 6: Run the test and the real check**

Run: `pnpm vitest run --project scripts check-playground-size && pnpm build && pnpm --filter @texaryn/playground build:pages && node scripts/check-playground-size.mjs apps/playground/dist`
Expected: tests PASS; the check prints three sizes under their limits and exits 0. Record the three numbers in the pull request description.

- [x] **Step 7: Commit and open the pull request**

```bash
git add apps/playground/vite.config.ts scripts/check-playground-size.mjs scripts/check-playground-size.test.mjs package.json
git commit -m "build(playground): enforce first-load and lazy chunk size limits"
```

Run `pnpm build && pnpm typecheck && pnpm test && pnpm site:build && pnpm docs:check`, push, and open the pull request referencing #239. After merge, on the live site: plant `"type": "strin"` and see the underline, use autocomplete, Format then undo, switch the theme, and type in the editor on a phone.

---

## PR 3: Width presets and data presets

Branch `feat/playground-presets`, from `main` after PR 2 merged.

### Task 12: Presets in the examples contract

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
    expect(['initial', 'custom'], `${example.id} uses a reserved preset id`).not.toContain(preset.id)
    expect(preset.data, `${example.id} preset ${preset.id} has undefined data`).not.toBeUndefined()
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

### Task 13: Data presets in the controls, width presets in the preview header

**Files:**
- Create: `apps/playground/src/workbench/presets.tsx`
- Create: `apps/playground/src/workbench/WidthPresets.tsx`
- Modify: `apps/playground/src/App.tsx` (`baseExampleId`; preset availability; `FormWorkspace` renders the preset select in its controls; the preview header; the preview host width)
- Modify: `apps/playground/src/playground.css`
- Modify: `packages/core/src/commands/types.ts`, `packages/core/src/commands/handler.ts`, `packages/core/src/runtime/runtime.ts`, and `packages/core/README.md`
- Test: `packages/core/src/runtime/__tests__/runtime.test.ts`
- Create: a minor `@texaryn/core` changeset and regenerate `docs/api`
- Test: `apps/playground/src/__tests__/presets.test.tsx`
- Test: `apps/playground/src/__tests__/presets.browser.test.tsx` for rendered preview dimensions

**Interfaces:**
- Consumes: `ExamplePreset` (Task 12), `PreviewWidth` and `LayoutAction` (Task 1), `Workbench` `previewHeader` (Task 3).
- Produces: a public `Validate` command that marks fields touched and validates current data immediately, regardless of automatic trigger hints, without incrementing submission attempts or invoking `onSubmit`; `applyPreset(runtime: FormRuntime, data: unknown, invalid: boolean): void`; `usePresetSelection(runtime: FormRuntime, presets: readonly ExamplePreset[], initialData: unknown): { selected: string; select: (id: string) => void }`; `DataPresetSelect` props `{ presets: readonly ExamplePreset[]; selected: string; onSelect: (id: string) => void }`; `PREVIEW_WIDTHS: readonly { id: PreviewWidth; label: string; px: number | null }[]`; `WidthPresets` props `{ width: PreviewWidth; effectiveWidth: number; onChange: (width: PreviewWidth) => void }`. `FormWorkspace` gains `presets: readonly ExamplePreset[]` and `exampleInitialData: unknown`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { App } from '../App.js'
import { editSchema, readSchemaText } from './schema-text.js'

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
    fireEvent.change(await screen.findByLabelText('Data preset'), { target: { value: 'too-short' } })
    const username = (await screen.findByLabelText('Username')) as HTMLInputElement
    await waitFor(() => expect(username.value).toBe('ab'))
    await waitFor(() => expect(username.getAttribute('aria-invalid')).toBe('true'))
    fireEvent.change(presetSelect(), { target: { value: 'valid' } })
    await waitFor(() => expect(username.value).toBe('grace'))
    expect(username.getAttribute('aria-invalid')).not.toBe('true')
  })

  it('validates presets with no hints and with change, blur and submit hints', async () => {
    await open('Validation triggers')
    fireEvent.change(await screen.findByLabelText('Data preset'), { target: { value: 'too-short' } })
    await waitFor(() => {
      expect(screen.getByLabelText('Validated on change').getAttribute('aria-invalid')).toBe('true')
      expect(screen.getByLabelText('Validated on blur').getAttribute('aria-invalid')).toBe('true')
      expect(screen.getByLabelText('Validated on submit').getAttribute('aria-invalid')).toBe('true')
    })
  })

  it('read Custom after the user edits', async () => {
    await open('String constraints')
    fireEvent.change(await screen.findByLabelText('Data preset'), { target: { value: 'valid' } })
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'linus' } })
    await waitFor(() => expect(presetSelect().value).toBe('custom'))
  })

  it('stay available while the editor holds invalid JSON', async () => {
    await open('String constraints')
    await screen.findByLabelText('Data preset')
    editSchema('{')
    fireEvent.change(presetSelect(), { target: { value: 'too-short' } })
    await waitFor(() => expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('ab'))
  })

  it('are withdrawn once an edited schema applies', async () => {
    await open('String constraints')
    await screen.findByLabelText('Data preset')
    const schema = JSON.parse(readSchemaText()) as Record<string, unknown>
    schema.title = 'Edited'
    editSchema(JSON.stringify(schema, null, 2))
    await waitFor(() => expect(screen.queryByLabelText('Data preset')).toBeNull(), { timeout: 3000 })
  })

  it('do not appear for an example without presets', async () => {
    await open('String field')
    await screen.findByLabelText('Name')
    expect(screen.queryByLabelText('Data preset')).toBeNull()
  })
})

describe('width presets', () => {
  it('applies the selected maximum, reports effective width and remembers the choice', async () => {
    await open('String field')
    fireEvent.click(screen.getByRole('button', { name: 'Phone' }))
    expect(document.querySelector<HTMLElement>('[data-pane-host="preview"]')!.style.maxWidth).toBe('375px')
    expect(screen.getByText('Maximum 375px')).toBeTruthy()
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

In core, add `{ type: 'Validate' }` to `Command` and `manual` to the validation-effect trigger union. Its handler marks every field node touched and emits one full-form validation effect with trigger `manual`. The runtime schedules it immediately regardless of per-field automatic trigger hints. A manual result updates field and visible errors, but leaves submission status and attempt count alone and never calls `onSubmit`. Keep `SetTouched` as blur validation gated by the existing blur hints. Add a runtime test with fields that have no hints and fields with change, blur and submit hints; one Validate must produce errors for all invalid fields without submitting.

`apps/playground/src/workbench/presets.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormRuntime } from '@texaryn/core'
import { useStore } from '@texaryn/react'
import type { ExamplePreset } from '@texaryn/examples'

export function applyPreset(runtime: FormRuntime, data: unknown, invalid: boolean): void {
  runtime.dispatch({ type: 'Reset', data: data === undefined ? {} : data })
  if (invalid) runtime.dispatch({ type: 'Validate' })
}

// The one place a preset is applied and remembered, so the Data select and the
// command palette agree on what is selected. FormWorkspace remounts for every
// runtime, so this state never outlives one.
export function usePresetSelection(
  runtime: FormRuntime,
  presets: readonly ExamplePreset[],
  initialData: unknown,
): { selected: string; select: (id: string) => void } {
  const data = useStore(runtime.data)
  const [selected, setSelected] = useState('initial')
  const applied = useRef<unknown>(runtime.data.getSnapshot())

  useEffect(() => {
    if (data !== applied.current) setSelected('custom')
  }, [data])

  const select = useCallback(
    (id: string) => {
      const preset = presets.find((candidate) => candidate.id === id)
      applyPreset(runtime, preset ? preset.data : initialData === undefined ? {} : initialData, preset?.invalid === true)
      applied.current = runtime.data.getSnapshot()
      setSelected(preset ? id : 'initial')
    },
    [runtime, presets, initialData],
  )

  return { selected, select }
}

export function DataPresetSelect({
  presets,
  selected,
  onSelect,
}: {
  presets: readonly ExamplePreset[]
  selected: string
  onSelect: (id: string) => void
}) {
  if (presets.length === 0) return null
  return (
    <label className="pg-preset">
      <span>Data</span>
      <select
        aria-label="Data preset"
        className="pg-select"
        value={selected}
        onChange={(event) => onSelect(event.target.value)}
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

`apps/playground/src/workbench/WidthPresets.tsx`:

```tsx
import type { PreviewWidth } from './layout.js'

export const PREVIEW_WIDTHS: readonly { id: PreviewWidth; label: string; px: number | null }[] = [
  { id: 'phone', label: 'Phone', px: 375 },
  { id: 'tablet', label: 'Tablet', px: 768 },
  { id: 'fit', label: 'Fit', px: null },
]

export function WidthPresets({ width, effectiveWidth, onChange }: { width: PreviewWidth; effectiveWidth: number; onChange: (width: PreviewWidth) => void }) {
  const px = PREVIEW_WIDTHS.find((entry) => entry.id === width)?.px ?? null
  return (
    <div className="pg-width-presets" role="group" aria-label="Preview width">
      {PREVIEW_WIDTHS.map(({ id, label }) => (
        <button key={id} type="button" aria-pressed={width === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
      {px !== null && <span className="pg-width-presets__label">Maximum {px}px</span>}
      <span className="pg-width-presets__effective">Effective {effectiveWidth}px</span>
    </div>
  )
}
```

In `App.tsx`:

1. Keep the example the form came from, separately from #241's `selectedId`, which turns `custom` on the first edit: `const [baseExampleId, setBaseExampleId] = useState(initialExample?.id ?? null)`, set in `handleSelectExample` and in the `popstate` handler.
2. Offer presets only while the applied schema is that example's schema. Invalid draft text never changes `appliedSchema`, so they stay available while the editor holds broken JSON:

```tsx
const baseExample = baseExampleId === null ? undefined : getExample(baseExampleId)
const presets =
  baseExample && appliedSchemaKey === stableJson(baseExample.schema) ? (baseExample.presets ?? []) : []
```

3. Pass `presets={presets}` and `exampleInitialData={baseExample?.initialData}` to `FormWorkspace`. Inside it, after `useForm`:

```tsx
const presetSelection = usePresetSelection(form.runtime, presets, exampleInitialData)
```

and render inside its `pg-submit-row`, after the Simulate failure label:

```tsx
<DataPresetSelect presets={presets} selected={presetSelection.selected} onSelect={presetSelection.select} />
```

4. Measure the effective host width, give the workbench its preview header, and size the preview host:

```tsx
previewHeader={<WidthPresets width={layout.previewWidth} effectiveWidth={effectivePreviewWidth} onChange={(width) => dispatchLayout({ type: 'setPreviewWidth', width })} />}
```

Observe `hosts.preview` with `ResizeObserver`, round its `getBoundingClientRect().width`, and pass that value as `effectivePreviewWidth`. This reports the actual host width when a selected maximum is wider than its pane.

```tsx
useEffect(() => {
  const px = PREVIEW_WIDTHS.find((entry) => entry.id === layout.previewWidth)?.px ?? null
  hosts.preview.style.maxWidth = px === null || narrow ? '' : `${px}px`
}, [hosts.preview, layout.previewWidth, narrow])
```

`playground.css`:

```css
.pg-pane-host[data-pane-host='preview'] {
  width: 100%;
  margin-inline: auto;
  box-sizing: border-box;
}

.pg-width-presets {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.pg-width-presets button {
  font: inherit;
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--tx-border);
  border-radius: var(--tx-radius);
  background: none;
  color: var(--tx-text-muted);
  cursor: pointer;
}

.pg-width-presets button[aria-pressed='true'] {
  background: var(--tx-accent-soft);
  color: var(--tx-text);
}

.pg-width-presets__label {
  font-size: 0.75rem;
  color: var(--tx-text-muted);
}

.pg-width-presets__effective {
  font-size: 0.75rem;
  color: var(--tx-text-muted);
}

.pg-preset {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
```

- [ ] **Step 4: Run the playground project**

Run: `pnpm vitest run --project playground && pnpm vitest run --project playground-browser`
Expected: PASS.

The jsdom test may assert the inline maximum style and stored choice. In `presets.browser.test.tsx`, also measure `getBoundingClientRect().width` in Chromium at both 820px and a wide viewport. When Tablet is selected at 820px, show the selected 768px maximum separately from the smaller effective width. After resizing the pane, the effective width label must track the measured host width.

- [ ] **Step 5: Check every renderer by hand once**

Run: `pnpm --filter @texaryn/playground dev`, open String constraints, apply Too short with each of the nine renderers, and note whether the error shows. Put the result in the pull request description: it answers the spec's second open question.

- [ ] **Step 6: Commit and open the pull request**

```bash
git add apps/playground/src
git commit -m "feat(playground): data presets in the controls and preview width presets"
```

Run `pnpm build && pnpm typecheck && pnpm test && pnpm site:build`, push, and open the pull request referencing #239.

---

## PR 4: Command palette

Branch `feat/playground-command-palette`, from `main` after PR 3 merges.

### Task 14: The command list

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
    const commands = buildCommands({ examples, renderers, presets: [], canFormat: true, desktop: true, actions: actions() })
    expect(commands.filter((command) => command.group === 'Examples')).toHaveLength(examples.length)
    expect(commands.filter((command) => command.group === 'Renderers')).toHaveLength(renderers.length)
  })

  it('runs the matching action', () => {
    const spy = actions()
    const commands = buildCommands({ examples, renderers, presets: [], canFormat: true, desktop: true, actions: spy })
    commands.find((command) => command.label === 'Switch to React · Bootstrap 5')!.run()
    expect(spy.selectRenderer).toHaveBeenCalledWith('bootstrap')
    commands.find((command) => command.label === 'Maximize preview')!.run()
    expect(spy.layout).toHaveBeenCalledWith({ type: 'maximize', pane: 'preview' })
  })

  it('offers presets, Format and layout commands only where they can run', () => {
    const presets = [{ id: 'valid', label: 'Valid', data: {} }]
    const phone = buildCommands({ examples, renderers, presets, canFormat: false, desktop: false, actions: actions() })
    expect(phone.some((command) => command.label === 'Apply data preset: Valid')).toBe(true)
    expect(phone.some((command) => command.label === 'Format schema')).toBe(false)
    expect(phone.some((command) => command.group === 'Layout')).toBe(false)
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
  desktop: boolean
  actions: CommandActions
}

export function buildCommands({ examples, renderers, presets, canFormat, desktop, actions }: CommandInput): PaletteCommand[] {
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
  if (desktop) {
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
      layout('examples', 'Collapse or expand the examples', { type: 'toggleExamples' }),
      { id: 'layout:reset', group: 'Layout', label: 'Reset layout', run: actions.resetLayout },
    )
  }
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

### Task 15: The palette

**Files:**
- Modify: `apps/playground/package.json` (`pnpm --filter @texaryn/playground add -E cmdk@1.1.1`)
- Create: `apps/playground/src/palette/CommandPalette.tsx` (default export, the lazy chunk)
- Create: `apps/playground/src/palette-slot.tsx` (in the main bundle: lazy wrapper and the shortcut)
- Modify: `apps/playground/src/App.tsx` (open state, commands, the `FormWorkspace` action handle, Commands buttons, status hint)
- Modify: `apps/playground/src/playground.css`
- Test: `apps/playground/src/__tests__/command-palette.test.tsx`
- Test: `apps/playground/src/__tests__/command-palette.browser.test.tsx` for keyboard use and focus restoration
- Test: `apps/playground/src/__tests__/palette-slot.test.tsx` for lazy-load failure isolation

**Interfaces:**
- Consumes: `buildCommands`, `PaletteCommand` (Task 14); `usePresetSelection` inside `FormWorkspace` (Task 13); `StatusBar` `hint` (Task 5).
- Produces: `CommandPalette` props `{ open: boolean; onOpenChange: (open: boolean) => void; commands: readonly PaletteCommand[] }`, `useCommandPaletteShortcut(onOpen: () => void): void`, `CommandPaletteSlot` with the same props, `interface WorkspaceActions { applyPreset(preset: ExamplePreset | null): void; getData(): unknown }`; `FormWorkspace` gains `onActions: (actions: WorkspaceActions | null) => void`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { App } from '../App.js'
import { resetMediaQueries, setMediaQuery } from '../test-setup.js'
import { NARROW_QUERY } from '../workbench/use-narrow-viewport.js'

afterEach(() => {
  cleanup()
  resetMediaQueries()
})

async function openPalette(): Promise<HTMLElement> {
  render(<App />)
  await screen.findByLabelText('Name')
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
    await screen.findByLabelText('Name')
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull())
  })

  it('formats an unchanged example without switching it to Custom', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    await screen.findByLabelText('Name')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' })
    const input = dialog.querySelector('input')!
    fireEvent.change(input, { target: { value: 'Format schema' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(window.location.hash).toBe(''))
    expect(window.location.pathname).toMatch(/basics-string/)
  })

  it('reports when the palette cannot copy the schema', async () => {
    render(<App />)
    await screen.findByLabelText('Name')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' })
    const input = dialog.querySelector('input')!
    fireEvent.change(input, { target: { value: 'Copy schema' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText(/copy failed/i)).toBeTruthy()
  })

  it('applies a data preset through the workspace', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String constraints' }))
    await screen.findByLabelText('Username')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' })
    const input = dialog.querySelector('input')!
    fireEvent.change(input, { target: { value: 'Too short' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('ab'))
    expect((screen.getByLabelText('Data preset') as HTMLSelectElement).value).toBe('too-short')
  })

  it('opens from a Commands button on a phone', async () => {
    setMediaQuery(NARROW_QUERY, true)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open command palette' }))
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy()
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
import { Component, Suspense, lazy, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { CommandPaletteProps } from './palette/CommandPalette.js'

const CommandPalette = lazy(() => import('./palette/CommandPalette.js'))

export class PaletteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true } }
  render(): ReactNode { return this.state.failed ? null : this.props.children }
}

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
    <PaletteBoundary>
      <Suspense fallback={null}>
        <CommandPalette {...props} />
      </Suspense>
    </PaletteBoundary>
  )
}
```

In `palette-slot.test.tsx`, place a child that throws inside `PaletteBoundary` beside a rendered playground. The error stays inside the boundary and the form remains mounted.

In `FormWorkspace`, register the actions that need the runtime while it is mounted:

```tsx
useEffect(() => {
  onActions({
    // Through the same selection the Data select uses, so it shows the preset by name.
    applyPreset: (preset) => presetSelection.select(preset ? preset.id : 'initial'),
    getData: () => form.runtime.data.getSnapshot(),
  })
  return () => onActions(null)
}, [form.runtime, presetSelection.select, onActions])
```

In `App.tsx`, define one `handleFormatSchema` and one `handleCopySchema` with the toolbar's current formatting behavior and clipboard success or failure feedback. Reuse the same clipboard helper for `handleCopyData`. Use these same handlers from the toolbar and palette; do not reimplement clipboard writes or formatting in `buildCommands`:

The Chromium test in `command-palette.browser.test.tsx` focuses CodeMirror, opens the palette with Ctrl K, types and accepts a command, then opens it again and closes with Escape. Assert that focus returns to the editor. Also test Cmd K and the Commands button on a phone. This covers the actual `cmdk` dialog focus behavior, not only synthetic key events in jsdom.

```tsx
const workspaceActions = useRef<WorkspaceActions | null>(null)
const setWorkspaceActions = useCallback((actions: WorkspaceActions | null) => {
  workspaceActions.current = actions
}, [])
const [paletteOpen, setPaletteOpen] = useState(false)
const openPalette = useCallback(() => setPaletteOpen(true), [])
useCommandPaletteShortcut(openPalette)
const commands = buildCommands({
  examples,
  renderers: Object.entries(rendererLabels).map(([key, label]) => ({ key: key as RendererKey, label })),
  presets,
  canFormat: parseError === null,
  desktop: !narrow,
  actions: {
    selectExample: handleSelectExample,
    selectRenderer: setRendererKey,
    applyPreset: (preset) => workspaceActions.current?.applyPreset(preset),
    layout: dispatchLayout,
    resetLayout,
    setTheme: theme.setPreference,
    formatSchema: handleFormatSchema,
    copySchema: handleCopySchema,
    copyData: handleCopyData,
    openDocs: () => window.open(DOCS_URL, '_self'),
  },
})
```

Pass `onActions={setWorkspaceActions}` to `FormWorkspace`. Render `<CommandPaletteSlot open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />` at the end of `.pg-app`; a Commands button `<button type="button" className="pg-header__button" aria-label="Open command palette" onClick={openPalette}>Commands</button>` in the header nav on desktop and in `pg-mobile-workspace` on phones; and `hint={<kbd>Ctrl K</kbd>}` on `StatusBar`.

`playground.css`:

```css
.pg-palette__overlay {
  position: fixed;
  inset: 0;
  z-index: 9;
  background: rgb(0 0 0 / 30%);
}

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

Run: `pnpm vitest run --project playground && pnpm vitest run --project playground-browser && pnpm build && pnpm --filter @texaryn/playground build:pages && node scripts/check-playground-size.mjs apps/playground/dist`
Expected: PASS, and the `palette` chunk under 25 KB.

- [ ] **Step 5: Commit and open the pull request**

```bash
git add apps/playground pnpm-lock.yaml
git commit -m "feat(playground): command palette on Ctrl K"
```

Run `pnpm build && pnpm typecheck && pnpm test && pnpm site:build`, push, and open the pull request. Reference #239, and close it in that pull request only if the tracker's remaining items are done. After merge, on the live site: Ctrl K and Cmd K, switch renderer, jump to an example, apply a preset, and open the palette from the Commands button on a phone.

---

## Self-review against the spec

| Spec section | Task |
| --- | --- |
| Layout A on desktop, default sizes and minimums | 3 |
| Persistent hosts, runtime lifecycle unchanged | 2, 4 |
| Pane operations: collapse, maximize, Focus, restore, reset | 1, 3 |
| Saved sizes only from user interactions; exact restore | 3, 6 |
| Collapsed and covered panes are inert; focus moves into overlays and back | 3 |
| Desktop from 820px, where the minimums fit; phone CSS moved to match | 3, 6 |
| Phones keep #241's layout; editor loads on first Schema view | 3, 4, 10 |
| Status bar | 5, 10, 15 |
| Keyboard separators | 3, 6 |
| Editor extensions, history rules, Visual keeps the editor, Tab leaves, colors from tokens, re-measure after a host move | 2, 10 |
| Submit works from overlays and after a breakpoint crossing | 6 |
| `checkSchema`, shared preparation, escaping and ambiguity | 7 |
| Stale checks dropped | 10 |
| Pointer to range | 8 |
| Keyword autocomplete, draft-07 default | 9 |
| Width presets | 13 |
| Data presets: contract, availability, apply in place | 12, 13 |
| Command palette, phone entry | 14, 15 |
| Browser tests at three sizes and two themes | 6, 10 |
| Size budget, and lazy chunks proven lazy from the build manifest | 11, 15 |
