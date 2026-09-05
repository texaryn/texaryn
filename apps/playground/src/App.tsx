import { useCallback, useEffect, useRef, useState } from 'react'
import type { RendererRegistry, SchemaEvaluationPort } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import {
  useForm,
  FormContext,
  FormRoot,
  ErrorSummary,
  createDefaultRegistry,
} from '@texaryn/react'
import type { WidgetComponent } from '@texaryn/react'
import { createBootstrapRegistry } from '@texaryn/react-bootstrap'
import { createMuiRegistry } from '@texaryn/react-mui'
import { examples, getExample } from '@texaryn/examples'
import type { TexarynExample } from '@texaryn/examples'
import { ExampleBrowser } from './ExampleBrowser.js'
import { Inspector, DEFAULT_TAB } from './Inspector.js'
import type { Tab } from './Inspector.js'
import { VueHost } from './VueHost.js'
import { formatLocation, parseLocation } from './routing.js'
import type { RendererKey } from './routing.js'
import './playground.css'

const BOOTSTRAP_CSS = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css'

// Vue carries no React registry: it is a different render surface over the
// same runtime rather than another set of React widgets, so it is listed here
// for the selector and rendered through VueHost instead of FormRoot.
const registries: Record<
  RendererKey,
  { label: string; registry: RendererRegistry<WidgetComponent> | null }
> = {
  default: { label: 'Default', registry: createDefaultRegistry() },
  bootstrap: { label: 'Bootstrap 5', registry: createBootstrapRegistry() },
  mui: { label: 'Material UI', registry: createMuiRegistry() },
  vue: { label: 'Vue', registry: null },
}

// The demo owns stylesheet loading. The Bootstrap package never loads CSS, and
// loading it globally would restyle the Default renderer too.
function useBootstrapStylesheet(active: boolean) {
  useEffect(() => {
    if (!active) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = BOOTSTRAP_CSS
    document.head.appendChild(link)
    return () => {
      link.remove()
    }
  }, [active])
}

function formatSchema(schema: unknown): string {
  return JSON.stringify(schema, null, 2)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

type AdapterState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; port: SchemaEvaluationPort; id: number }

function useAdapter(schemaText: string, parseError: string | null): AdapterState {
  const [state, setState] = useState<AdapterState>({ status: 'loading' })
  const nextId = useRef(0)

  useEffect(() => {
    if (parseError) {
      return
    }

    let cancelled = false
    setState({ status: 'loading' })

    let parsed: unknown
    try {
      parsed = JSON.parse(schemaText)
    } catch (err) {
      setState({ status: 'error', message: errorMessage(err) })
      return
    }

    createJsonSchemaAdapter(parsed)
      .then((port) => {
        if (!cancelled) {
          nextId.current += 1
          setState({ status: 'ready', port, id: nextId.current })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: errorMessage(err) })
        }
      })

    return () => {
      cancelled = true
    }
  }, [schemaText, parseError])

  return state
}

function FormWorkspace({
  port,
  entry,
  registry,
  schemaText,
  tab,
  onTabChange,
}: {
  port: SchemaEvaluationPort
  entry: { initialData?: unknown; hints?: TexarynExample['hints'] }
  registry: RendererRegistry<WidgetComponent> | null
  schemaText: string
  tab: Tab
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

  return (
    <>
      <div className="pg-col pg-col--preview">
        <FormContext.Provider value={form.runtime}>
          <ErrorSummary />
          {registry ? (
            <FormRoot registry={registry} />
          ) : (
            // Same runtime, different framework. VueHost mounts a Vue
            // application over this exact instance rather than building one
            // of its own, so switching renderer keeps the form.
            <VueHost runtime={form.runtime} />
          )}

          <div className="pg-submit-row">
            <button
              type="button"
              disabled={
                form.submission.status === 'validating' ||
                form.submission.status === 'submitting'
              }
              onClick={() => form.dispatch({ type: 'Submit' })}
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
        </FormContext.Provider>
      </div>
      <div className="pg-col pg-col--inspect">
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
        />
      </div>
    </>
  )
}

const CUSTOM_KEY = 'custom'
const customEntry = { initialData: undefined, hints: undefined }

const BASE_URL = import.meta.env.BASE_URL ?? '/'

// An unknown id falls back to the first example rather than an empty screen,
// so a stale or mistyped link still lands somewhere usable.
function resolveExample(id: string | null): TexarynExample | undefined {
  if (id === null) return examples[0]
  return getExample(id) ?? examples[0]
}

export function App() {
  const initial = parseLocation(window.location.pathname, window.location.search, BASE_URL)
  const [rendererKey, setRendererKey] = useState<RendererKey>(initial.renderer)
  const [selectedId, setSelectedId] = useState<string | null>(
    () => resolveExample(initial.exampleId)?.id ?? null,
  )
  const [query, setQuery] = useState('')
  const [inspectorTab, setInspectorTab] = useState<Tab>(DEFAULT_TAB)
  const [schemaText, setSchemaText] = useState(() =>
    formatSchema(resolveExample(initial.exampleId)?.schema ?? {}),
  )
  const [parseError, setParseError] = useState<string | null>(null)

  useBootstrapStylesheet(rendererKey === 'bootstrap')

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
        setSelectedId(example.id)
        setSchemaText(formatSchema(example.schema))
        setParseError(null)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const handleSchemaChange = useCallback((text: string) => {
    setSelectedId(CUSTOM_KEY)
    setSchemaText(text)
    try {
      JSON.parse(text)
      setParseError(null)
    } catch (err) {
      setParseError(errorMessage(err))
    }
  }, [])

  const handleSelectExample = useCallback((example: TexarynExample) => {
    setSelectedId(example.id)
    setSchemaText(formatSchema(example.schema))
    setParseError(null)
  }, [])

  const adapterState = useAdapter(schemaText, parseError)
  const selectedExample = selectedId === null ? undefined : getExample(selectedId)
  const entry = selectedExample ?? customEntry
  const selectedKey = selectedId ?? CUSTOM_KEY

  return (
    <div className="pg-app">
      <div className="pg-col pg-col--source">
        <h1 className="pg-title">Texaryn Playground</h1>

        <label className="pg-label" htmlFor="renderer-select">
          Renderer
        </label>
        <select
          id="renderer-select"
          className="pg-select"
          value={rendererKey}
          onChange={(e) => setRendererKey(e.target.value as RendererKey)}
        >
          {Object.entries(registries).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <ExampleBrowser
          query={query}
          onQueryChange={setQuery}
          selectedId={selectedId}
          onSelect={handleSelectExample}
        />

        {selectedExample && (
          <p className="pg-description">{selectedExample.description}</p>
        )}

        <h2 className="pg-heading" id="schema-editor-label">
          JSON Schema
        </h2>
        <textarea
          aria-labelledby="schema-editor-label"
          value={schemaText}
          onChange={(e) => handleSchemaChange(e.target.value)}
          className="pg-schema-editor"
          spellCheck={false}
        />
        {parseError && <div className="pg-error">Invalid JSON: {parseError}</div>}
      </div>

      {parseError ? (
        <>
          <div className="pg-col pg-col--preview">
            <div className="pg-error">Fix the schema JSON to see the form.</div>
          </div>
          <div className="pg-col pg-col--inspect">
            <h2 className="pg-heading">Live Data</h2>
            <pre className="pg-pre">—</pre>
          </div>
        </>
      ) : adapterState.status === 'loading' ? (
        <>
          <div className="pg-col pg-col--preview">Loading…</div>
          <div className="pg-col pg-col--inspect">
            <h2 className="pg-heading">Live Data</h2>
            <pre className="pg-pre">—</pre>
          </div>
        </>
      ) : adapterState.status === 'error' ? (
        <>
          <div className="pg-col pg-col--preview">
            <div className="pg-error">{adapterState.message}</div>
          </div>
          <div className="pg-col pg-col--inspect">
            <h2 className="pg-heading">Live Data</h2>
            <pre className="pg-pre">—</pre>
          </div>
        </>
      ) : (
        <FormWorkspace
          // Deliberately excludes the renderer. The runtime belongs to the
          // selected example and its schema; the renderer is presentation
          // over it, so switching one must not remount the form and discard
          // live data. Changing example or schema does mean a new runtime.
          key={`${selectedKey}:${adapterState.id}`}
          port={adapterState.port}
          entry={entry}
          registry={registries[rendererKey].registry}
          schemaText={schemaText}
          tab={inspectorTab}
          onTabChange={setInspectorTab}
        />
      )}
    </div>
  )
}
