import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { SchemaEvaluationPort } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { useForm, FormProvider, ErrorSummary } from '@texaryn/react'
import { examples, getExample } from '@texaryn/examples'
import type { TexarynExample } from '@texaryn/examples'
import { ExampleBrowser } from './ExampleBrowser.js'
import { FormBuilder } from './FormBuilder.js'
import { Inspector, DEFAULT_TAB } from './Inspector.js'
import type { Tab } from './Inspector.js'
import { RendererSurface } from './RendererSurface.js'
import { ThemeSelect } from './ThemeSelect.js'
import { useTheme } from './theme.js'
import type { ResolvedTheme } from './theme.js'
import { clearStoredPanelSizes, useLayout } from './workbench/layout.js'
import { PaneSlot, usePaneHosts } from './workbench/pane-hosts.js'
import type { PaneHosts } from './workbench/pane-hosts.js'
import { dialectLabel } from './workbench/dialect-label.js'
import { StatusBar } from './workbench/StatusBar.js'
import { useNarrowViewport } from './workbench/use-narrow-viewport.js'
import { Workbench } from './workbench/Workbench.js'
import { docsHref, formatLocation, parseLocation } from './routing.js'
import type { RendererKey } from './routing.js'
import type { RendererProps } from './renderer-types.js'
import './playground.css'

const REPOSITORY_URL = 'https://github.com/texaryn/texaryn'

// Every label names its framework and its widget set, because three of these
// are React and two are not, and a list that says `Material UI` beside `Vue`
// invites reading the others as the only ones with a framework.
//
const rendererLabels: Record<RendererKey, string> = {
  default: 'React · Default',
  bootstrap: 'React · Bootstrap 5',
  mui: 'React · Material UI',
  emotion: 'React · Emotion styles',
  tailwind: 'React · Tailwind CSS',
  vue: 'Vue · Default',
  svelte: 'Svelte · Default',
  solid: 'Solid · Default',
  wc: 'Web Components · Default',
}

const rendererLoaders: Record<RendererKey, () => Promise<{ default: ComponentType<RendererProps> }>> = {
  default: () => import('./renderers/ReactDefaultRenderer.js'),
  bootstrap: () => import('./renderers/ReactBootstrapRenderer.js'),
  mui: () => import('./renderers/ReactMuiRenderer.js'),
  emotion: () => import('./renderers/ReactEmotionRenderer.js'),
  tailwind: () => import('./renderers/ReactTailwindRenderer.js'),
  vue: () => import('./renderers/VueRenderer.js'),
  svelte: () => import('./renderers/SvelteRenderer.js'),
  solid: () => import('./renderers/SolidRenderer.js'),
  wc: () => import('./renderers/WebComponentsRenderer.js'),
}

const rendererCache = new Map<RendererKey, ComponentType<RendererProps>>()

function formatSchema(schema: unknown): string {
  return JSON.stringify(schema, null, 2)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

type AdapterState =
  | { status: 'loading' }
  | { status: 'error'; message: string; schemaKey: string }
  | {
      status: 'ready'
      port: SchemaEvaluationPort
      id: number
      schemaKey: string
      error?: string
    }

function useAdapter(schema: unknown): AdapterState {
  const [state, setState] = useState<AdapterState>({ status: 'loading' })
  const nextId = useRef(0)
  const schemaKey = stableJson(schema)

  useEffect(() => {
    let cancelled = false
    setState((previous) =>
      previous.status === 'ready' ? { ...previous, error: undefined } : previous,
    )

    createJsonSchemaAdapter(schema)
      .then((port) => {
        if (!cancelled) {
          nextId.current += 1
          setState({ status: 'ready', port, id: nextId.current, schemaKey })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = errorMessage(err)
          setState((previous) =>
            previous.status === 'ready'
              ? { ...previous, error: message }
              : { status: 'error', message, schemaKey },
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [schema, schemaKey])

  return state
}

// The preview and inspector columns come as a pair in every state, including
// the three where there is no form to show. Writing that pair once keeps the
// renderer selector outside the adapter's conditional, which is where it has
// to be: choosing a renderer while a schema is still compiling is normal.
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

function FormWorkspace({
  hosts,
  port,
  entry,
  rendererKey,
  rendererLabel,
  rendererComponent: Renderer,
  rendererLoadError,
  defaultStyleMode,
  resolvedTheme,
  schemaText,
  tab,
  toolbar,
  previewNotice,
  onDataChange,
  onTabChange,
}: {
  hosts: PaneHosts
  port: SchemaEvaluationPort
  entry: { initialData?: unknown; hints?: TexarynExample['hints'] }
  rendererKey: RendererKey
  rendererLabel: string
  rendererComponent: ComponentType<RendererProps> | null
  rendererLoadError: string | null
  defaultStyleMode: 'baseline' | 'unstyled'
  resolvedTheme: ResolvedTheme
  schemaText: string
  tab: Tab
  toolbar: ReactNode
  previewNotice: string | null
  onDataChange: (data: unknown) => void
  onTabChange: (tab: Tab) => void
}) {
  const simulateFailureRef = useRef(false)
  const [simulateFailure, setSimulateFailure] = useState(false)

  simulateFailureRef.current = simulateFailure

  const form = useForm(port, {
    initialData: entry.initialData,
    hints: entry.hints,
    onSubmit: async (data) => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      if (simulateFailureRef.current) {
        throw new Error('Simulated submission failure')
      }
      console.log('Submitted:', data)
    },
  })

  useEffect(() => {
    const store = form.runtime.data
    onDataChange(store.getSnapshot())
    return store.subscribe(() => onDataChange(store.getSnapshot()))
  }, [form.runtime, onDataChange])

  const isBootstrap = rendererKey === 'bootstrap'
  const hasReactSummary = ['default', 'mui', 'emotion', 'tailwind'].includes(rendererKey)
  const bootstrapFormRef = useRef<HTMLFormElement | null>(null)
  const setBootstrapForm = useCallback((element: HTMLFormElement | null) => {
    bootstrapFormRef.current = element
  }, [])
  const submit = () => form.runtime.dispatch({ type: 'Submit' })
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submit()
  }
  const rendererSurface = (
    <RendererSurface
      rendererKey={rendererKey}
      label={rendererLabel}
      theme={resolvedTheme}
      defaultStyleMode={defaultStyleMode}
    >
      {rendererLoadError ? (
        <p className="pg-error" role="alert">Could not load {rendererLabel}: {rendererLoadError}</p>
      ) : Renderer ? (
        <Renderer
          runtime={form.runtime}
          theme={resolvedTheme}
          onSubmit={handleSubmit}
          onSubmitForm={isBootstrap ? setBootstrapForm : undefined}
        />
      ) : (
        <p className="pg-empty" role="status">Loading {rendererLabel}…</p>
      )}
    </RendererSurface>
  )
  const controls = (
    <section className="pg-controls" aria-labelledby="playground-controls">
      <h2 className="pg-controls__title" id="playground-controls">
        Playground controls
      </h2>

      <div className="pg-submit-row">
        <button
          type={isBootstrap ? 'button' : 'submit'}
          className="pg-button"
          onClick={isBootstrap ? () => bootstrapFormRef.current?.requestSubmit() : undefined}
          disabled={
            form.submission.status === 'validating' ||
            form.submission.status === 'submitting'
          }
        >
          {form.submission.status === 'validating'
            ? 'Validating...'
            : form.submission.status === 'submitting'
              ? 'Submitting...'
              : 'Submit'}
        </button>

        <label className="pg-checkbox-label">
          <input
            type="checkbox"
            checked={simulateFailure}
            onChange={(e) => setSimulateFailure(e.target.checked)}
          />
          Simulate failure
        </label>
      </div>

      {form.submission.status === 'submitted' && (
        <p className="pg-success">Submitted successfully.</p>
      )}
      {form.submission.error != null && (
        <p className="pg-error">
          {form.submission.error instanceof Error
            ? form.submission.error.message
            : String(form.submission.error)}
        </p>
      )}
    </section>
  )

  return (
    <>
      {createPortal(
        <>
          {toolbar}
          {previewNotice && <p className="pg-preview-notice" role="status">{previewNotice}</p>}
          <FormProvider value={form.runtime}>
            {isBootstrap ? (
              <>
                {rendererSurface}
                {controls}
              </>
            ) : (
              <form
                className="pg-runtime-form"
                noValidate
                onSubmit={handleSubmit}
              >
                {hasReactSummary && <ErrorSummary />}
                {rendererSurface}
                {controls}
              </form>
            )}
          </FormProvider>
        </>,
        hosts.preview,
      )}

      {createPortal(
        <Inspector
          runtime={form.runtime}
          port={port}
          data={form.data}
          submission={form.submission}
          document={form.document}
          schemaText={schemaText}
          hints={entry.hints}
          tab={tab}
          onTabChange={onTabChange}
        />,
        hosts.inspector,
      )}
    </>
  )
}

const CUSTOM_KEY = 'custom'
const customEntry = { initialData: undefined, hints: undefined }

const BASE_URL = import.meta.env.BASE_URL ?? '/'
const DOCS_URL = docsHref(BASE_URL)

// An unknown id falls back to the first example rather than an empty screen,
// so a stale or mistyped link still lands somewhere usable.
function resolveExample(id: string | null): TexarynExample | undefined {
  if (id === null) return examples[0]
  return getExample(id) ?? examples[0]
}

export function App() {
  const initial = parseLocation(window.location.pathname, window.location.search, BASE_URL)
  const initialExample = resolveExample(initial.exampleId)
  const [rendererKey, setRendererKey] = useState<RendererKey>(initial.renderer)
  const [defaultStyleMode, setDefaultStyleMode] = useState<'baseline' | 'unstyled'>('baseline')
  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialExample?.id ?? null,
  )
  const [query, setQuery] = useState('')
  const [inspectorTab, setInspectorTab] = useState<Tab>(DEFAULT_TAB)
  const [schemaMode, setSchemaMode] = useState<'visual' | 'json'>('json')
  const [mobilePanel, setMobilePanel] = useState<'preview' | 'schema' | 'inspector'>('preview')
  const [activeHints, setActiveHints] = useState<TexarynExample['hints']>(initialExample?.hints)
  const [appliedSchema, setAppliedSchema] = useState<unknown>(
    () => initialExample?.schema ?? {},
  )
  const [schemaText, setSchemaText] = useState(() =>
    formatSchema(initialExample?.schema ?? {}),
  )
  const [exampleRevision, setExampleRevision] = useState(0)
  const [resetRevision, setResetRevision] = useState(0)
  const [loadedRenderers, setLoadedRenderers] = useState<Partial<Record<RendererKey, ComponentType<RendererProps>>>>({})
  const [rendererErrors, setRendererErrors] = useState<Partial<Record<RendererKey, string>>>({})
  const latestData = useRef<unknown>(initialExample?.initialData)
  const preserveCurrentData = useRef(false)
  const theme = useTheme()
  const hosts = usePaneHosts()
  const narrow = useNarrowViewport()
  const [layout, dispatchLayout] = useLayout()
  const [resetSignal, setResetSignal] = useState(0)
  const resetLayout = useCallback(() => {
    clearStoredPanelSizes()
    dispatchLayout({ type: 'reset' })
    setResetSignal((signal) => signal + 1)
  }, [dispatchLayout])

  useEffect(() => {
    const cached = rendererCache.get(rendererKey)
    if (cached) {
      setLoadedRenderers((previous) => ({ ...previous, [rendererKey]: cached }))
      setRendererErrors((previous) => ({ ...previous, [rendererKey]: undefined }))
      return
    }

    let cancelled = false
    setRendererErrors((previous) => ({ ...previous, [rendererKey]: undefined }))
    rendererLoaders[rendererKey]()
      .then((module) => {
        rendererCache.set(rendererKey, module.default)
        if (!cancelled) {
          setLoadedRenderers((previous) => ({ ...previous, [rendererKey]: module.default }))
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRendererErrors((previous) => ({
            ...previous,
            [rendererKey]: errorMessage(error),
          }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [rendererKey])

  const parsedDraft = useMemo(() => {
    try {
      return { schema: JSON.parse(schemaText) as unknown, error: null }
    } catch (err) {
      return { schema: undefined, error: errorMessage(err) }
    }
  }, [schemaText])
  const parseError = parsedDraft.error
  const appliedSchemaKey = stableJson(appliedSchema)
  const draftHasChanges =
    parsedDraft.error === null && stableJson(parsedDraft.schema) !== appliedSchemaKey

  useEffect(() => {
    if (parseError || !draftHasChanges) return
    const timeout = window.setTimeout(() => setAppliedSchema(parsedDraft.schema), 300)
    return () => window.clearTimeout(timeout)
  }, [draftHasChanges, parseError, parsedDraft.schema])

  // The URL follows the visible state. Data is deliberately not in it: a
  // shared link reproduces what someone was looking at, not what they typed.
  useEffect(() => {
    const url = formatLocation(
      { exampleId: selectedId === CUSTOM_KEY ? null : selectedId, renderer: rendererKey },
      BASE_URL,
    )
    if (`${window.location.pathname}${window.location.search}` !== url) {
      window.history.replaceState(null, '', url)
    }
  }, [selectedId, rendererKey])

  useEffect(() => {
    function onPopState() {
      const next = parseLocation(window.location.pathname, window.location.search, BASE_URL)
      const example = resolveExample(next.exampleId)
      setRendererKey(next.renderer)
      if (example) {
        preserveCurrentData.current = false
        latestData.current = example.initialData
        setSelectedId(example.id)
        setActiveHints(example.hints)
        setSchemaText(formatSchema(example.schema))
        setAppliedSchema(example.schema)
        setExampleRevision((revision) => revision + 1)
        setMobilePanel('preview')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const handleSchemaChange = useCallback((text: string) => {
    preserveCurrentData.current = true
    setSelectedId(CUSTOM_KEY)
    setSchemaText(text)
  }, [])

  const handleSelectExample = useCallback((example: TexarynExample) => {
    preserveCurrentData.current = false
    latestData.current = example.initialData
    setSelectedId(example.id)
    setActiveHints(example.hints)
    setSchemaText(formatSchema(example.schema))
    setAppliedSchema(example.schema)
    setExampleRevision((revision) => revision + 1)
    setMobilePanel('preview')
  }, [])

  const handleDataChange = useCallback((data: unknown) => {
    latestData.current = data
  }, [])

  const handleReset = useCallback(() => {
    preserveCurrentData.current = false
    latestData.current = undefined
    setResetRevision((revision) => revision + 1)
  }, [])

  const adapterState = useAdapter(appliedSchema)
  const selectedExample = selectedId === null ? undefined : getExample(selectedId)
  const entry = selectedId === CUSTOM_KEY
    ? { initialData: customEntry.initialData, hints: activeHints }
    : selectedExample ?? customEntry
  const initialData = preserveCurrentData.current ? latestData.current : entry.initialData
  const adapterMatchesDraft =
    adapterState.status === 'ready' && adapterState.schemaKey === appliedSchemaKey
  const previewNotice = parseError
    ? 'Invalid JSON. This preview shows the last valid schema.'
    : adapterState.status === 'ready' && adapterState.error
      ? `The schema could not be applied. This preview shows the last valid schema. ${adapterState.error}`
      : draftHasChanges || (adapterState.status === 'ready' && !adapterMatchesDraft)
        ? 'Applying schema changes. The preview shows the last valid schema until they are ready.'
        : null

  // The control sits on the region it governs, and says what that region is,
  // because the answer is narrower than the page implies: choosing Vue swaps
  // the form subtree and leaves the shell around it in React.
  const usesDefaultStyles =
    rendererKey === 'default' ||
    rendererKey === 'vue' ||
    rendererKey === 'svelte' ||
    rendererKey === 'solid' ||
    rendererKey === 'wc'
  const toolbar = (
    <div className="pg-toolbar">
      <div className="pg-toolbar__group">
        <label className="pg-toolbar__label" htmlFor="renderer-select">Form renderer</label>
        <select
          id="renderer-select"
          className="pg-select"
          value={rendererKey}
          onChange={(e) => setRendererKey(e.target.value as RendererKey)}
        >
          {Object.entries(rendererLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
      {usesDefaultStyles && (
        <div className="pg-toolbar__group">
          <label className="pg-toolbar__label" htmlFor="default-style-select">Presentation</label>
          <select
            id="default-style-select"
            className="pg-select"
            value={defaultStyleMode}
            onChange={(event) => setDefaultStyleMode(event.target.value as 'baseline' | 'unstyled')}
          >
            <option value="baseline">Playground baseline</option>
            <option value="unstyled">Unstyled</option>
          </select>
        </div>
      )}
      <p className="pg-toolbar__note">Applies to the form below. The page around it stays React.</p>
    </div>
  )

  const examplesContent = (
    <>
      <ExampleBrowser
        query={query}
        onQueryChange={setQuery}
        selectedId={selectedId}
        onSelect={handleSelectExample}
      />
      {selectedExample && <p className="pg-description">{selectedExample.description}</p>}
    </>
  )
  const schemaContent = (
    <>
      <div className="pg-schema-heading">
        <h2 className="pg-heading" id="schema-editor-label">JSON Schema</h2>
        <button className="pg-button pg-button--quiet" type="button" onClick={handleReset}>
          Reset data
        </button>
      </div>
      <div className="pg-editor-tabs" role="group" aria-label="Schema editor mode">
        <button
          aria-pressed={schemaMode === 'visual'}
          className="pg-editor-tabs__item"
          type="button"
          onClick={() => setSchemaMode('visual')}
        >
          Visual
        </button>
        <button
          aria-pressed={schemaMode === 'json'}
          className="pg-editor-tabs__item"
          type="button"
          onClick={() => setSchemaMode('json')}
        >
          JSON
        </button>
      </div>
      <div id="schema-editor-panel">
        {schemaMode === 'visual' ? (
          <FormBuilder schemaText={schemaText} onSchemaChange={handleSchemaChange} />
        ) : (
          <textarea
            aria-labelledby="schema-editor-label"
            className="pg-schema-editor"
            value={schemaText}
            onChange={(e) => handleSchemaChange(e.target.value)}
            spellCheck={false}
            wrap="off"
          />
        )}
      </div>
      {parseError && <div className="pg-error">Invalid JSON: {parseError}</div>}
    </>
  )

  return (
    <div className="pg-app">
      <header className="pg-header">
        {/* One text node and one span rather than two spans: a flex gap is a
            layout space, not a character, so two spans read as one word. */}
        <h1 className="pg-brand">
          Texaryn <span className="pg-brand__sub">Playground</span>
        </h1>
        <nav className="pg-header__nav" aria-label="Texaryn">
          <a className="pg-header__link" href={DOCS_URL}>
            Docs
          </a>
          <a className="pg-header__link" href={REPOSITORY_URL}>
            GitHub
          </a>
          {!narrow && (
            <>
              <button
                type="button"
                className="pg-header__button"
                data-focus-toggle
                aria-pressed={layout.focus}
                onClick={() => dispatchLayout({ type: 'toggleFocus' })}
              >
                Focus
              </button>
              <button type="button" className="pg-header__button" onClick={resetLayout}>
                Reset layout
              </button>
            </>
          )}
          <ThemeSelect preference={theme.preference} onChange={theme.setPreference} />
        </nav>
      </header>

      {narrow ? (
        <>
          <div className="pg-mobile-workspace">
            <label className="pg-mobile-workspace__example">
              Example
              <select
                className="pg-select"
                value={selectedId ?? CUSTOM_KEY}
                onChange={(event) => {
                  const example = getExample(event.target.value)
                  if (example) handleSelectExample(example)
                }}
              >
                {selectedId === CUSTOM_KEY && <option value={CUSTOM_KEY}>Custom schema</option>}
                {examples.map((example) => (
                  <option key={example.id} value={example.id}>{example.title}</option>
                ))}
              </select>
            </label>
            <div className="pg-mobile-workspace__tabs" role="group" aria-label="Playground panels">
              {(['preview', 'schema', 'inspector'] as const).map((panelName) => (
                <button
                  key={panelName}
                  type="button"
                  aria-pressed={mobilePanel === panelName}
                  onClick={() => setMobilePanel(panelName)}
                >
                  {panelName === 'preview' ? 'Form' : panelName === 'schema' ? 'Schema' : 'Inspector'}
                </button>
              ))}
            </div>
          </div>

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
        </>
      ) : (
        <Workbench
          hosts={hosts}
          layout={layout}
          dispatch={dispatchLayout}
          resetSignal={resetSignal}
        />
      )}
      {createPortal(examplesContent, hosts.examples)}
      {createPortal(schemaContent, hosts.schema)}

      {adapterState.status === 'loading' ? (
        <NotReady hosts={hosts} toolbar={toolbar}>
          <p className="pg-empty">Loading…</p>
        </NotReady>
      ) : adapterState.status === 'error' ? (
        <NotReady hosts={hosts} toolbar={toolbar}>
          <p className="pg-error">{adapterState.message}</p>
        </NotReady>
      ) : selectedId !== CUSTOM_KEY && !adapterMatchesDraft ? (
        <NotReady hosts={hosts} toolbar={toolbar}>
          <p className="pg-empty">Loading the selected example…</p>
        </NotReady>
      ) : (
        <FormWorkspace
          hosts={hosts}
          key={`${adapterState.id}:${exampleRevision}:${resetRevision}`}
          port={adapterState.port}
          entry={{ initialData, hints: entry.hints }}
          rendererKey={rendererKey}
          rendererLabel={rendererLabels[rendererKey]}
          rendererComponent={loadedRenderers[rendererKey] ?? null}
          rendererLoadError={rendererErrors[rendererKey] ?? null}
          defaultStyleMode={defaultStyleMode}
          resolvedTheme={theme.resolved}
          schemaText={schemaText}
          tab={inspectorTab}
          toolbar={toolbar}
          previewNotice={previewNotice}
          onDataChange={handleDataChange}
          onTabChange={setInspectorTab}
        />
      )}
      {!narrow && (
        <StatusBar dialect={dialectLabel(appliedSchema)} parseError={parseError} pending={draftHasChanges} />
      )}
    </div>
  )
}
