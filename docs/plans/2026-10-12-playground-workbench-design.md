# Playground workbench

The playground becomes a workbench: a schema editor that looks and checks like VS Code beside the live form, an inspector docked underneath, panes that resize, collapse and maximize, and a phone layout that shows one view at a time. This document is the design agreed with the maintainer on 2026-10-12. The implementation plan follows from it.

Tracker: [#239](https://github.com/texaryn/texaryn/issues/239) · Status: draft for review

## The problem

The playground is where people judge Texaryn, and today it hides the product. Measured on the live site with headless Chromium on 2026-10-12:

- **The schema editor is a 195px textarea** in a 313px column, so every line wraps after about 20 characters ([#231](https://github.com/texaryn/texaryn/issues/231)).
- **The example list collapses** to 2 of 43 entries at 1024x768, because it shares one `100dvh` column with the editor.
- **On a phone the form starts 2,108px down the page**, below a 1,466px example list.
- **The inspector header wraps** at 1512px, and its JSON views cannot fold.
- **There is no syntax highlighting, folding or schema checking.** A typo such as `"type": "strin"` only shows up as a broken form.

## Constraints

- React 19 shell, Vite, static GitHub Pages, free tier. No backend, no new CI job.
- The renderer selector swaps only the form subtree. Nine renderers share one `FormRuntime`.
- Light, dark and auto themes come from the `--tx-*` custom properties and `theme.ts`.
- Everything works on a phone and from the keyboard.
- The site deploys only from `main`, so each change is checked on the live origin after merge.

## Decisions

All made by the maintainer on 2026-10-12, after an independent review with web search and the measurements below.

- **Layout A**: example rail on the left, schema and preview side by side, inspector docked across the bottom, status bar.
- **CodeMirror 6 with VS Code colors**, not Monaco.
- **Schema checking through Texaryn's own schema library**, not a CodeMirror plugin.
- **Four extras in the first round**: preview width presets, data presets, a command palette, keyword autocomplete.

## Proposed design

### The shell

```
App
├─ Toolbar          brand, example title, renderer select, Focus, theme, layout reset
├─ Workbench        react-resizable-panels
│  ├─ ExampleRail   Examples and Command palette buttons; opens ExampleDrawer
│  └─ Group (vertical)
│     ├─ Group (horizontal)
│     │  ├─ Panel "schema"     SchemaPane: JSON editor or Visual builder
│     │  └─ Panel "preview"    PreviewPane: width presets, data presets, RendererSurface
│     └─ Panel "inspector"     the current Inspector, collapsible
└─ StatusBar        dialect, JSON state, schema error count, cursor position, Ctrl K hint
```

Default sizes: schema 46% and preview 54% of the top row; top row 72% and inspector 28% of the height. Minimums: schema 280px, preview 320px, inspector 120px. At 1512x900 that gives the editor about 590px instead of 195px.

`react-resizable-panels` is pinned at `4.14.4`, its version on 2026-10-12, for `Group`, `Panel`, `Separator` and `useDefaultLayout`. Every separator is focusable, resizes with the arrow keys, and has an accessible name such as "Resize schema and preview".

### Which state lives where

This is the rule that makes everything else safe: **a layout change never remounts the editor or the form.**

- **Runtime.** The adapter and `FormRuntime` move out of `FormWorkspace` into a `useWorkspace` hook at the top of `App`, shared through context. Panes read from it. The hook calls `createFormRuntime` itself, because `useForm` creates its runtime once per mount and would need a remount to change it. Only `RendererSurface` inside the preview pane is keyed by runtime identity, because the Vue, Svelte, Solid and Web Components hosts mount once per runtime.
- **Schema text.** Stays in `App` state as the one source. The editor reports changes up and receives replacements (example switch, Format) as a transaction on its existing view.
- **Layout.** A `useLayout` reducer holds panel sizes, the collapsed inspector, the maximized pane, Focus mode, the pinned drawer and the preview width. It persists under the key `texaryn-playground-layout` with a version field. Unreadable or outdated storage falls back to the defaults, inside the same `try` guard `theme.ts` uses.

### Pane operations

| Operation | Applies to | Behavior |
| --- | --- | --- |
| Collapse | Inspector | Shrinks to its tab header; a click on the header expands it |
| Maximize | Schema, preview, inspector | The pane fills the workbench; its header shows Restore |
| Focus | Whole workbench | Hides the example list, the rail and the inspector; schema and preview keep their split |
| Restore | Maximized pane, Focus | Returns to the previous layout exactly |
| Reset layout | Whole workbench | Default sizes and visibility, and clears the stored layout |

Nothing hides on its own. Hover-triggered panels fail on touch screens and for keyboard users, so every pane opens and closes on an explicit action.

### The example drawer

The existing `ExampleBrowser` (search plus categories) starts pinned: a 216px panel on the left, so a first visit shows the catalog. Unpinning it leaves the rail, whose Examples button then opens the list as a 260px overlay. In the overlay, selecting an example closes it, and Escape closes it and returns focus to the rail button. The selected example is scrolled into view with `scrollIntoView({ block: 'nearest' })`.

### Phones and narrow windows

Below 800px there are no panels and no separators. A Preview, Schema, Inspector switch under the toolbar shows one view at a time, and the toolbar's Examples button opens the drawer full height. Switching views keeps the schema text, the undo history, the form data and the inspector tab. The phone layout opens on Preview.

### The schema editor

The editor lives in `apps/playground/src/editor/` and loads as its own chunk the first time the schema pane shows. Until then, and if loading fails, the existing textarea stays in place.

- **Extensions**: `@codemirror/lang-json`, line numbers, folding, bracket matching, search, undo history, active line, and the default keymap without `indentWithTab`. Tab moves focus out of the editor, so keyboard users are never trapped; Enter indents.
- **Header buttons**: JSON or Visual (the existing `FormBuilder`), Format (only while the JSON parses), Copy, Maximize.
- **Colors**: CSS custom properties `--tx-code-bg`, `--tx-code-gutter`, `--tx-code-key`, `--tx-code-string`, `--tx-code-number`, `--tx-code-keyword`, `--tx-code-selection` and `--tx-code-active-line`, defined for both themes in `playground.css`. The values come from VS Code's colors as published in `@uiw/codemirror-theme-vscode` 4.25.12, for example keys `#9cdcfe` and strings `#ce9178` in dark, keys `#0070c1` and strings `#a31515` in light. The editor theme reads the variables, so a theme switch needs no editor reconfiguration.

### Schema checking

Two lint sources run 300ms after the last keystroke:

1. **Syntax**: CodeMirror's JSON parse linter.
2. **Schema**: a new export from `@texaryn/schema-json`, `checkSchema(schema: unknown, config?: AdapterConfig): Promise<SchemaIssue[]>`, where `SchemaIssue` is `{ pointer: JsonPointer; code: string; message: string }`. It runs the same preparation as `createJsonSchemaAdapter` (dialect detection, bundled metaschemas, `prepareSchema`) and returns the compiled root's `schemaErrors`.

`json-schema-library` reports those locations as `#/properties/a/b/minLength` for a property named `a/b`: it does not escape `/` or `~` (the same defect as [#184](https://github.com/texaryn/texaryn/issues/184)). `checkSchema` resolves each path against the schema's actual keys and returns an RFC 6901 pointer, `/properties/a~1b/minLength`. The message is the library's `data.message`, without its "Invalid schema found at" prefix.

The editor maps each pointer to a range by walking the Lezer JSON tree: object members by property name, array elements by index. A segment that cannot be found attaches the issue to the deepest node that was.

Why a helper in `schema-json` rather than a direct import: the playground resolves `@texaryn/schema-json` through its build output, which rewrites `json-schema-library` imports to a vendored copy in `dist/vendor`. Importing the library directly would ship a second copy and could compile with different options. `checkSchema` is new public API, so it needs a changeset and a regenerated `docs/api`.

Evidence that this checker is the right one, from the test on 2026-10-12. Each checker received a schema with six planted errors: `"type": "strin"`, `"minLength": "3"`, `"required": "name"`, an invalid type inside `prefixItems`, the draft-07 array form of `items`, and an invalid `minimum` inside `$defs`.

| Checker | Result |
| --- | --- |
| `@texaryn/json-schema-library` 11.6.6, `compileSchema(schema).schemaErrors` | All six, one each, with JSON pointers; a valid 2020-12 schema stays clean; draft-07 works too |
| `@invopop/codemirror-json-schema` 0.9.3 with the official 2020-12 file | None, silently |
| The same plugin with the seven 2020-12 vocabulary files bundled into `$defs` | All six, but the `items` error appears 8 times |
| Monaco 0.57.0, default | None; one warning that the 2020-12 schema cannot be loaded |

⚠️ The editor and the form agree only while `checkSchema` compiles exactly as the adapter does. It has to live next to the adapter in `schema-json` and share its option builder, never be rebuilt inside the playground.

Messages are `json-schema-library`'s own text. That is acceptable in a developer tool; user-facing copy is [#235](https://github.com/texaryn/texaryn/issues/235).

### Keyword autocomplete

A static module, `editor/keywords.ts`, lists the keywords of each dialect (2020-12, 2019-09, draft-07, draft-04) with a one-line description and value type. The dialect comes from `$schema`, defaulting to draft-07, which is what the adapter assumes when a schema declares none.

- **Keywords complete** as property names inside any schema object.
- **No keyword completion** directly inside `properties`, `patternProperties`, `$defs`, `definitions` or `dependentSchemas`, whose keys are names, not keywords.
- **Values complete** for `type` (the seven simple types), `$schema` (the four dialect URIs) and `format`.

### Preview width presets

Phone (375px), Tablet (768px) and Fit buttons in the preview header set the maximum width of the area the renderer draws into, with the current width shown as a label. Field widths, labels and wrapping react. Rules keyed to the browser window's width do not change; emulating a device viewport would need an iframe, which is out of scope. The choice persists with the layout.

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

- **Apply**: `runtime.dispatch({ type: 'Reset', data })`, so it works with all nine renderers and keeps the runtime. For an `invalid` preset, a `SetTouched` follows for every field node, so the errors show as they would after a user left each field.
- **Initial** is always offered and resets to the example's `initialData`. After the user edits, the menu label reads Custom.
- **Tests**, beside the existing `startsInvalid` checks: an `invalid` preset must produce at least one error, every other preset none, and preset ids are unique within an example. `@texaryn/examples` is private, so no changeset.
- **First examples with presets**: `basics-required`, `validation-string-constraints`, `validation-numeric-constraints`, `validation-exclusive-numeric-constraints`, `validation-array-constraints`, `conditional-if-then-else`, `composition-one-of`, `composition-any-of`, `runtime-array-interactions`, `runtime-validation-triggers`, `runtime-submission`.

### Command palette

`cmdk` 1.1.1, loaded on the first Ctrl K or Cmd K, or from the rail button on touch screens. The shortcut is registered on the window, so it also works from inside the editor. Commands:

- Go to any of the 43 examples
- Switch to any of the nine renderers
- Apply a data preset of the current example
- Focus mode, maximize a pane, collapse the inspector, reset the layout
- Light, dark or auto theme
- Format schema, copy schema, copy data
- Open the documentation

## Testing

- **Unit tests** in the existing `playground` Vitest project: the layout reducer and its storage fallback, pointer to range mapping on sample documents, keyword context detection per dialect, preset application through runtime commands, and the palette's command list.
- **Preset tests** in the `examples` project, as above.
- **Browser tests** in a new `playground-browser` Vitest project on Playwright Chromium, the same setup as the existing `web-components-browser` project. At 1512x900, 1024x768 and 390x844, in light and dark: no horizontal page overflow; the right panes are visible after each layout operation; form data survives layout operations and renderer switches; arrow keys on a separator change pane sizes; a planted schema error gets a diagnostic on the right line.
- **Before release, by hand**: typing in the editor on iOS Safari and Android Chrome, and the layout at 200% and 400% browser zoom.

These run inside the existing test job. Chromium only, to stay inside the free CI minutes.

## Size budget

Today the playground loads one script of 942 KB, 295 KB gzipped. Measured with esbuild 0.28.2, minified, gzip level 9, on 2026-10-12:

| Addition | Gzipped | Loads |
| --- | --- | --- |
| `react-resizable-panels` 4.14.4 | 20 KB | With the page |
| CodeMirror 6 setup with `@codemirror/lang-json` | 137 KB | When the schema pane first shows |
| `cmdk` 1.1.1 | 18 KB | On first palette open |

Limits, enforced by a new `scripts/check-playground-size.mjs` that runs in `site:build` after the playground build: the first-load scripts at most 320 KB gzipped, the `editor` chunk at most 150 KB, the `palette` chunk at most 25 KB. Vite's `manualChunks` gives the two lazy chunks those names.

## Why this over the alternatives

- **Monaco**: its README answers No to mobile browsers; 1,057 KB gzipped plus 227 KB of workers plus 27 KB of CSS; version 0.57.0 bundles only the draft-04 and draft-07 meta-schemas, so 2020-12 needs the same workaround ([microsoft/monaco-editor#5172](https://github.com/microsoft/monaco-editor/issues/5172)).
- **`@monaco-editor/react` from a CDN**: loads 0.55.1 from jsDelivr regardless of the installed version, depends on Monaco's deprecated AMD build, and sends every visitor to a third party.
- **`@invopop/codemirror-json-schema`**: brings the total to 332 KB, wraps validation in a bare `catch {}` so failures look like a clean schema, repeats diagnostics, and is a second engine that can disagree with the runtime.
- **Three columns or preview first**: about 480px for the editor at 1512px, cramped at 1024px; preview first hides the editor behind a drawer.
- **A docking library such as FlexLayout**: arbitrary docking is more than three fixed panes need.

## Rollout

Each step is its own pull request on a branch from `main`.

0. **Schema edits keep the form data** ([#232](https://github.com/texaryn/texaryn/issues/232)). Prerequisite: an editor that reports every keystroke would otherwise reset the form on each one.
1. **Workbench shell**: panels, rail and drawer, pane operations, saved layout, phone view, status bar. Closes [#231](https://github.com/texaryn/texaryn/issues/231).
2. **CodeMirror editor**: lazy chunk, colors, `checkSchema` with its changeset, pointer mapping, keyword autocomplete, Format and Copy, the size check.
3. **Width presets and data presets**, including the `examples` contract and the first eleven examples.
4. **Command palette.**

Related issues stay separate: the Bootstrap stylesheet leak ([#233](https://github.com/texaryn/texaryn/issues/233)) and duplicate error summaries ([#234](https://github.com/texaryn/texaryn/issues/234)) are independent; the inspector tree ([#236](https://github.com/texaryn/texaryn/issues/236)) replaces what the dock hosts later; lazy renderer loading ([#237](https://github.com/texaryn/texaryn/issues/237)) would lower the first-load size this budget assumes.

## Risks

- **Lifting the runtime breaks renderer switching.** Trigger: a host keyed by the wrong identity. Consequence: data lost on switch. The existing `renderer-switch` tests plus a new test that a layout operation does not remount the form.
- **Editor input on phones.** Trigger: virtual keyboards and touch selection. Consequence: an editor that cannot be used on a phone. The manual device pass before release.
- **Wrong error position.** Trigger: pointers through arrays, escaped names (`~0`, `~1`) or unresolved segments. Consequence: an underline on the wrong line. Mapping tests cover each case.
- **Panel library changes.** Trigger: `react-resizable-panels` 4.14 shipped on 2026-10-10. Consequence: API churn in minor releases. Pin the exact version.
- **Stored layout from an older release.** Trigger: a changed layout shape. Consequence: a broken layout on load. The version field and the fallback to defaults.

## Open questions

- **Public or tooling API?** Should `checkSchema` be part of the documented API of `@texaryn/schema-json`, or a subpath export marked for tooling? Needs the maintainer, at the review of step 2.
- **Errors after a preset.** Does `SetTouched` on every field reveal errors identically in all nine renderers? Needs a check during step 3.

## Out of scope

The inspector tree view, share links, a field to schema navigation that needs a provenance model, side by side renderer comparison, device emulation in an iframe, and Monaco.
