# Playground workbench

The playground became a workbench through [#245](https://github.com/texaryn/texaryn/pull/245), [#246](https://github.com/texaryn/texaryn/pull/246), and [#247](https://github.com/texaryn/texaryn/pull/247). The shell now keeps form state across layout changes, shares custom schemas, and provides a checked CodeMirror editor. This document records the design decisions and the remaining implementation sequence: data and width presets, then the command palette.

Tracker: [#239](https://github.com/texaryn/texaryn/issues/239) · Status: shell and editor complete; presets and command palette remain.

## The remaining work

The workbench shell in #245 made its panes resizable, collapsible and maximizable. PR #246 added local persistence and share links for custom schemas. PR #247 replaced the textarea with the lazy CodeMirror editor and schema diagnostics. The remaining work in this plan adds named data states, preview width presets, and a searchable command palette.

## Constraints

- React 19 shell, Vite, static GitHub Pages, free tier. No backend, no new CI job.
- The renderer selector swaps only the form subtree. Nine renderers are loaded on demand and receive `RendererProps` (`runtime`, `theme`, `onSubmit`, `onSubmitForm`); the playground owns the `<form>` element, with a separate submission path for Bootstrap.
- `FormWorkspace` owns the `FormRuntime` through `useForm`, keyed by adapter, example revision and reset revision, and carries data across schema rebuilds.
- Light, dark and auto themes come from the `--tx-*` custom properties and `theme.ts`.
- Phones keep #241's layout: an example select and a Form, Schema, Inspector switch show one view at a time, and the page scrolls as a whole. #241 applies it below 761px; the desktop minimums below add up to 768px, so it now applies below 820px.
- PR #247 measured the first load at 165.0 KB gzip and the editor chunk at 133.4 KB. The palette remains unloaded until opened. The enforced limits are 175 KB, 150 KB and 25 KB respectively.
- The site deploys only from `main`, so each change is checked on the live origin after merge.

## Decisions

All made by the maintainer on 2026-10-12, after an independent review with web search and the measurements below.

- **Layout A** on desktop: example list on the left, schema and preview side by side, inspector docked across the bottom, status bar.
- **#241's phone layout and example list stay.** The workbench is a desktop layout; phones keep what #241 shipped.
- **CodeMirror 6 with VS Code colors**, not Monaco.
- **Schema checking through Texaryn's own schema library**, not a CodeMirror plugin.
- **Four extras in the first round**: preview width presets, data presets, a command palette, keyword autocomplete.

## Proposed design

### The shell on desktop

```
App
├─ Header           brand, Docs, GitHub, Commands, Focus, Reset layout, theme
├─ Workbench        react-resizable-panels, 820px and wider
│  ├─ Rail          shown while the example list is collapsed: Examples
│  ├─ Panel "examples"     example list and description, collapsible
│  └─ Panel "main"
│     ├─ Panel "top"
│     │  ├─ Panel "schema"     header: JSON or Visual, Format, Copy, Reset data, Maximize
│     │  └─ Panel "preview"    header: renderer, presentation, width, Maximize
│     └─ Panel "inspector"     header: Collapse, Maximize
└─ StatusBar        dialect, JSON state, schema error count, cursor position, Ctrl K hint
```

Default sizes: example list 216px; schema 46% and preview 54% of the top row; top row 72% and inspector 28% of the height. Minimums: example list 160px, schema 280px, preview 320px, inspector 120px.

`react-resizable-panels` is pinned at `4.14.4`, its version on 2026-10-12, for `Group`, `Panel`, `Separator`, panel handles and `useDefaultLayout`. Every separator is focusable, resizes with the arrow keys, and has an accessible name such as "Resize schema and preview". Maximize and Focus are overlays above the panel group, so they never resize it, and saved sizes use `onlySaveAfterUserInteractions: true`, so a programmatic collapse or expand is never stored either.

### Pane content lives in persistent hosts

This is the rule that makes everything else safe: **a layout change never remounts the editor or the form.**

Each pane's content renders through a React portal into a host `<div>` that is created once and never replaced: one host each for the example list, the schema editor, the preview and the inspector. A layout (the desktop workbench, or #241's phone columns) only provides slots, and a slot appends its host when it mounts. Because the portal's container is the same element whatever layout holds it, React never remounts the content: not when a pane is maximized, collapsed or resized, and not when the window crosses the 820px breakpoint.

- **Runtime.** Unchanged. `FormWorkspace` keeps owning the runtime through `useForm` with #241's key and data carry. It sits outside both layouts and renders its preview part into the preview host and its inspector part into the inspector host. The schema rebuild, example switch and reset behave exactly as #241 tested them.
- **Schema text.** Stays in `App` state as the one source.
- **Layout.** A `useLayout` reducer holds the collapsed inspector, the collapsed example list, the maximized pane, Focus mode and the preview width, persisted under `texaryn-playground-layout` with a version field. Unreadable or outdated storage falls back to the defaults, inside the same `try` guard `theme.ts` uses. Panel sizes persist separately through `useDefaultLayout`.

Moving a host to another parent blurs whatever had focus inside it, so crossing the breakpoint while typing loses focus but nothing else. A slot announces each move on the host, and the editor re-measures on it, so clicks land on the right character after a move.

### Pane operations

| Operation | Applies to | Behavior |
| --- | --- | --- |
| Collapse | Inspector | Shrinks to its header; the body becomes `inert`, so it leaves the tab order |
| Collapse | Example list | Shrinks to the rail; the rail's Examples button expands it again |
| Maximize | Schema, preview, inspector | An overlay takes the pane's host and fills the workbench; the panels underneath keep their sizes and become `inert`; the overlay's header shows Restore |
| Focus | Whole workbench | An overlay holds schema and preview side by side, with their own saved split; the panels underneath, with the example list and the inspector, become `inert` |
| Restore | Maximized pane, Focus | Removes the overlay; the panels never moved, so every size is exactly what the user had |

Opening an overlay moves keyboard focus to its Restore or Exit Focus button; closing it returns focus to the button that opened it.
| Reset layout | Whole workbench | Default sizes and visibility, and clears the stored layout |

Nothing hides on its own. Hover-triggered panels fail on touch screens and for keyboard users, so every pane opens and closes on an explicit action.

### Phones

Below 820px the workbench is replaced by #241's phone columns: example select, a Form, Schema and Inspector switch, and one column at a time. Their only change is the media query, from 760px to 819px, so the stylesheet and the tree agree. The hosts move into those columns. The editor chunk loads the first time the Schema view opens, not on the phone's first load.

### The schema editor

The editor lives in `apps/playground/src/editor/` and loads as its own chunk the first time the schema pane is visible. Until then, and if loading fails, the existing textarea stays in place.

- **Extensions**: `@codemirror/lang-json`, line numbers, folding, bracket matching, search, undo history, active line, and the default keymap without `indentWithTab`. Tab moves focus out of the editor, so keyboard users are never trapped; Enter indents.
- **History**: selecting another example starts a fresh editor state, so undo never crosses into a different document. Format and Visual builder edits arrive as ordinary transactions and can be undone.
- **Visual mode**: the editor stays mounted, hidden, while the Visual builder shows, so switching back keeps its state.
- **Colors**: CSS custom properties `--tx-code-bg`, `--tx-code-gutter`, `--tx-code-key`, `--tx-code-string`, `--tx-code-number`, `--tx-code-keyword`, `--tx-code-selection` and `--tx-code-active-line`, defined for both themes in `playground.css`. The values come from VS Code's colors as published in `@uiw/codemirror-theme-vscode` 4.25.12, for example keys `#9cdcfe` and strings `#ce9178` in dark, keys `#0070c1` and strings `#a31515` in light. The editor theme reads the variables, so a theme switch needs no editor reconfiguration.

### Schema checking

Two lint sources run 300ms after the last keystroke:

1. **Syntax**: CodeMirror's JSON parse linter.
2. **Schema**: the documented `@texaryn/schema-json` export `checkSchema(schema: unknown, config?: AdapterConfig): Promise<SchemaIssue[]>`, where `SchemaIssue` is `{ pointer: JsonPointer; code: string; message: string }`. Added in #247, it runs the same preparation as `createJsonSchemaAdapter` (dialect detection, bundled metaschemas, cycle rejection, `prepareSchema`) and returns the compiled root's `schemaErrors`. When that preparation throws, the editor shows the error once at the start of the document.

A check that finishes after the document has changed again is discarded, along with its error count.

`json-schema-library` reports locations without escaping property names: a property named `a/b` gives `#/properties/a/b/minLength`, the same defect as [#184](https://github.com/texaryn/texaryn/issues/184). `checkSchema` resolves each path against the schema's actual keys. When exactly one split of the path matches the document, it returns that RFC 6901 pointer, `/properties/a~1b/minLength`. When more than one split matches, the location is ambiguous, and `checkSchema` returns the longest prefix all splits share rather than guess. Fixing the escaping in Texaryn's `json-schema-library` fork removes the ambiguity; that is #184's work, not this design's. The message is the library's `data.message`, without its "Invalid schema found at" prefix.

The editor maps each pointer to a range by walking the Lezer JSON tree: object members by property name, array elements by index. A segment that cannot be found attaches the issue to the deepest node that was.

Why a helper in `schema-json` rather than a direct import: the playground resolves `@texaryn/schema-json` through its build output, which rewrites `json-schema-library` imports to a vendored copy in `dist/vendor`. Importing the library directly would ship a second copy and could compile with different options. #247 made `checkSchema` documented public API, with a changeset and generated `docs/api` pages.

Evidence that this checker is the right one, from the test on 2026-10-12. Each checker received a schema with six planted errors: `"type": "strin"`, `"minLength": "3"`, `"required": "name"`, an invalid type inside `prefixItems`, the draft-07 array form of `items`, and an invalid `minimum` inside `$defs`.

| Checker | Result |
| --- | --- |
| `@texaryn/json-schema-library` 11.6.6, `compileSchema(schema).schemaErrors` | All six, one each, with JSON pointers; a valid 2020-12 schema stays clean; draft-07 works too |
| `@invopop/codemirror-json-schema` 0.9.3 with the official 2020-12 file | None, silently |
| The same plugin with the seven 2020-12 vocabulary files bundled into `$defs` | All six, but the `items` error appears 8 times |
| Monaco 0.57.0, default | None; one warning that the 2020-12 schema cannot be loaded |

⚠️ The editor and the form agree only while `checkSchema` compiles exactly as the adapter does. It has to live next to the adapter in `schema-json` and share its preparation, never be rebuilt inside the playground.

### Keyword autocomplete

A static module, `editor/keywords.ts`, lists the keywords of each dialect (2020-12, 2019-09, draft-07, draft-04) with a one-line description and value type. The dialect comes from `$schema`, defaulting to draft-07, which is what the adapter assumes when a schema declares none.

- **Keywords complete** as property names inside any schema object.
- **No keyword completion** directly inside `properties`, `patternProperties`, `$defs`, `definitions` or `dependentSchemas`, whose keys are names, not keywords.
- **Values complete** for `type` (the seven simple types), `$schema` (the four dialect URIs) and `format`.

### Preview width presets

Phone (375px maximum), Tablet (768px maximum) and Fit buttons in the preview header set the maximum width of the preview host. The selected maximum is shown separately from the host's measured effective width, which can be smaller when the preview pane is narrow. Field widths, labels and wrapping react. Rules keyed to the browser window's width do not change; emulating a device viewport would need an iframe, which is out of scope. The choice persists with the layout.

### Data presets

`TexarynExample` in `@texaryn/examples` gains an optional field:

```ts
presets?: readonly ExamplePreset[]

interface ExamplePreset {
  id: string
  label: string
  data: unknown
  /** Set when the preset deliberately violates the example's schema. */
  invalid?: true
}
```

- **Where**: a Data select in the Playground controls region, next to Submit, because it acts on the runtime `FormWorkspace` owns.
- **When**: offered while the form on screen came from the unedited example, which is while the applied schema equals the example's schema. Invalid draft text does not change the applied schema, so presets stay available while the editor holds broken JSON.
- **Apply**: `runtime.dispatch({ type: 'Reset', data })`, so it works with all nine renderers and keeps the runtime. For an `invalid` preset, a public `Validate` command marks fields touched and runs full validation immediately without submitting or changing automatic blur and change triggers.
- **Initial** is always offered and resets to the example's `initialData`. Since the runtime represents an unstated root as `{}`, the playground sends `{}` when `initialData` is `undefined`, and preserves every other value including `null`. After the user edits, the select reads Custom.
- Preset ids are unique per example and cannot be `initial` or `custom`. Preset data cannot be `undefined`.
- **Tests**, beside the existing `startsInvalid` checks: an `invalid` preset must produce at least one error, every other preset none, and preset ids are unique within an example. `@texaryn/examples` is private, so no changeset.
- **First examples with presets**: `basics-required`, `validation-string-constraints`, `validation-numeric-constraints`, `validation-exclusive-numeric-constraints`, `validation-array-constraints`, `conditional-if-then-else`, `composition-one-of`, `composition-any-of`, `runtime-array-interactions`, `runtime-validation-triggers`, `runtime-submission`.

### Command palette

`cmdk` 1.1.1, loaded on the first Ctrl K or Cmd K, or from a Commands button: in the header on desktop, in #241's phone bar on phones. The shortcut is registered on the window, so it also works from inside the editor. Commands that act on the form (apply a preset, copy data) reach the runtime through an action handle `FormWorkspace` registers while it is mounted. Commands:

- Go to any of the 43 examples
- Switch to any of the nine renderers
- Apply a data preset of the current example
- Focus mode, maximize a pane, collapse the inspector, reset the layout
- Light, dark or auto theme
- Format schema, copy schema, copy data
- Open the documentation

## Testing

- **Unit tests** in the existing `playground` Vitest project: the layout reducer and its storage fallback, host reparenting keeping a stateful child mounted, pointer to range mapping, keyword context per dialect, preset application through runtime commands, and the palette's command list.
- **Preset tests** in the `examples` project, as above.
- **Browser tests** in a new `playground-browser` Vitest project on Playwright Chromium, the same setup as the existing `web-components-browser` project. At 1512x900, 1024x768, 820x800, 819x800 and 390x844, in light and dark chosen through the stored theme preference and confirmed on the root element: no horizontal page overflow; panes visible after each layout operation; a keyboard resize that changes and saves a size; exact sizes after Restore and after a reload; form data, the input element, the editor's undo history and its click positions surviving a breakpoint crossing; Submit firing once from an overlay and after a crossing, for a React renderer and for Bootstrap; real typing in the editor; a planted schema error underlined on the right text. The build check reads Vite's manifest to prove the editor and palette chunks are not loaded on first visit.
- **Before release, by hand**: typing in the editor on iOS Safari and Android Chrome, and the layout at 200% and 400% browser zoom.

These run inside the existing test job. Chromium only, to stay inside the free CI minutes.

## Size budget

PR #247 measured the built playground at 165.0 KB gzip for the initial load and 133.4 KB for the lazy editor. The palette measures 0 KB because it has not shipped yet. `site:build` runs `scripts/check-playground-size.mjs`, which computes transitive static import closures from Vite's manifest.

The enforced limits are 175 KB for the initial load, 150 KB for the editor, and 25 KB for the palette. PR 4 must measure the full palette closure, including its dialog dependencies, against the 25 KB limit.

## Why this over the alternatives

- **Monaco**: its README answers No to mobile browsers; 1,057 KB gzipped plus 227 KB of workers plus 27 KB of CSS; version 0.57.0 bundles only the draft-04 and draft-07 meta-schemas, so 2020-12 needs the same workaround ([microsoft/monaco-editor#5172](https://github.com/microsoft/monaco-editor/issues/5172)).
- **`@monaco-editor/react` from a CDN**: loads 0.55.1 from jsDelivr regardless of the installed version, depends on Monaco's deprecated AMD build, and sends every visitor to a third party.
- **`@invopop/codemirror-json-schema`**: brings the total to 332 KB, wraps validation in a bare `catch {}` so failures look like a clean schema, repeats diagnostics, and is a second engine that can disagree with the runtime.
- **Creating the runtime in a hook above the layout**: needs a new ownership and destruction contract, and would replace the remount behavior #241 tested. Persistent hosts keep that behavior and still keep layout changes from remounting anything.
- **Three columns or preview first**: about 480px for the editor at 1512px, cramped at 1024px; preview first hides the editor behind a drawer.
- **A docking library such as FlexLayout**: arbitrary docking is more than three fixed panes need.

## Rollout

Each implementation step is its own pull request on a branch from `main`.

1. **Workbench shell**, complete in [#245](https://github.com/texaryn/texaryn/pull/245): persistent pane hosts, desktop panels, pane operations, saved layout, the phone layout, and status bar.
2. **Schema sharing**, complete in [#246](https://github.com/texaryn/texaryn/pull/246): custom schemas persist locally and in share links.
3. **CodeMirror editor**, complete in [#247](https://github.com/texaryn/texaryn/pull/247): lazy editor chunk, colors, public `checkSchema`, pointer mapping, keyword completion, Format and Copy, and the manifest-based size check.
4. **Width presets and data presets**, including the `examples` contract and the first eleven examples.
5. **Command palette.**

## Risks

- **Portals and the form element.** Trigger: the preview part of `FormWorkspace` rendered into a host while its `<form>` and Bootstrap submission path keep working. Consequence: Submit stops working for one renderer. The existing `renderer-boundary` tests run unchanged against the portal version.
- **Moving a host with CodeMirror inside.** Trigger: the breakpoint crossing moves the editor's DOM. Consequence: clicks landing on the wrong character. The editor re-measures on the slot's move event, and a browser test clicks a known line after a crossing.
- **Editor input on phones.** Trigger: virtual keyboards and touch selection. Consequence: an editor that cannot be used on a phone. The manual device pass before release.
- **Wrong error position.** Trigger: pointers through arrays, escaped names (`~0`, `~1`), ambiguous unescaped paths or unresolved segments. Consequence: an underline on the wrong text. Mapping and resolution tests cover each case.
- **Panel library changes.** Trigger: `react-resizable-panels` 4.14 shipped on 2026-10-10. Consequence: API churn in minor releases. Pin the exact version.
- **Stored layout from an older release.** Trigger: a changed layout shape. Consequence: a broken layout on load. The version field and the fallback to defaults.

## Open questions

- **Errors after a preset.** Does the explicit manual validation command reveal errors identically in all nine renderers? Check during step 4.

## Out of scope

A field to schema navigation that needs a provenance model, side by side renderer comparison, device emulation in an iframe, the escaping fix in the schema library fork (#184), and Monaco. Custom schema share links shipped in #246.
