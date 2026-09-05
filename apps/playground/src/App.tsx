import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
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
import { formatLocation, parseLocation } from './routing.js'
import type { RendererKey } from './routing.js'

const BOOTSTRAP_CSS = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css'

const registries: Record<
  RendererKey,
  { label: string; registry: RendererRegistry<WidgetComponent> }
> = {
  default: { label: 'Default', registry: createDefaultRegistry() },
  bootstrap: { label: 'Bootstrap 5', registry: createBootstrapRegistry() },
  mui: { label: 'Material UI', registry: createMuiRegistry() },
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
  registry: RendererRegistry<WidgetComponent>
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
      <div style={styles.centerPanel}>
        <FormContext.Provider value={form.runtime}>
          <ErrorSummary />
          <FormRoot registry={registry} />

          <div style={styles.submitRow}>
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

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={simulateFailure}
                onChange={(e) => setSimulateFailure(e.target.checked)}
              />
              Simulate failure
            </label>
          </div>

          {form.submission.status === 'submitted' && (
            <p style={styles.success}>Submitted successfully.</p>
          )}
          {form.submission.error != null && (
            <p style={styles.error}>
              {form.submission.error instanceof Error
                ? form.submission.error.message
                : String(form.submission.error)}
            </p>
          )}
        </FormContext.Provider>
      </div>
      <div style={styles.rightPanel}>
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
    <div style={styles.app}>
      <div style={styles.leftPanel}>
        <h1 style={styles.title}>Texaryn Playground</h1>

        <label style={styles.label} htmlFor="renderer-select">
          Renderer
        </label>
        <select
          id="renderer-select"
          value={rendererKey}
          onChange={(e) => setRendererKey(e.target.value as RendererKey)}
          style={styles.select}
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
          <p style={styles.description}>{selectedExample.description}</p>
        )}

        <h2 style={styles.heading} id="schema-editor-label">
          JSON Schema
        </h2>
        <textarea
          aria-labelledby="schema-editor-label"
          value={schemaText}
          onChange={(e) => handleSchemaChange(e.target.value)}
          spellCheck={false}
          style={styles.textarea}
        />
        {parseError && <div style={styles.error}>Invalid JSON: {parseError}</div>}
      </div>

      {parseError ? (
        <>
          <div style={styles.centerPanel}>
            <div style={styles.error}>Fix the schema JSON to see the form.</div>
          </div>
          <div style={styles.rightPanel}>
            <h2 style={styles.heading}>Live Data</h2>
            <pre style={styles.pre}>—</pre>
          </div>
        </>
      ) : adapterState.status === 'loading' ? (
        <>
          <div style={styles.centerPanel}>Loading…</div>
          <div style={styles.rightPanel}>
            <h2 style={styles.heading}>Live Data</h2>
            <pre style={styles.pre}>—</pre>
          </div>
        </>
      ) : adapterState.status === 'error' ? (
        <>
          <div style={styles.centerPanel}>
            <div style={styles.error}>{adapterState.message}</div>
          </div>
          <div style={styles.rightPanel}>
            <h2 style={styles.heading}>Live Data</h2>
            <pre style={styles.pre}>—</pre>
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

const styles: Record<string, CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'row',
    height: '100vh',
    width: '100vw',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxSizing: 'border-box',
  },
  leftPanel: {
    flex: '1 1 0',
    display: 'flex',
    flexDirection: 'column',
    padding: '1rem',
    borderRight: '1px solid #ddd',
    overflow: 'auto',
    boxSizing: 'border-box',
  },
  centerPanel: {
    flex: '1 1 0',
    padding: '1rem',
    borderRight: '1px solid #ddd',
    overflow: 'auto',
    boxSizing: 'border-box',
  },
  rightPanel: {
    flex: '1 1 0',
    padding: '1rem',
    overflow: 'auto',
    boxSizing: 'border-box',
  },
  title: {
    fontSize: '1.25rem',
    margin: '0 0 1rem 0',
  },
  heading: {
    fontSize: '0.95rem',
    margin: '1rem 0 0.5rem 0',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: 600,
    marginBottom: '0.25rem',
  },
  select: {
    padding: '0.4rem',
    fontSize: '0.9rem',
  },
  textarea: {
    flex: '1 1 auto',
    minHeight: '300px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.85rem',
    padding: '0.5rem',
    boxSizing: 'border-box',
    resize: 'vertical',
  },
  pre: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.85rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  error: {
    color: '#b00020',
    fontSize: '0.85rem',
    marginTop: '0.5rem',
  },
  description: {
    fontSize: '0.8rem',
    color: '#555',
    lineHeight: 1.4,
    margin: '0.75rem 0 0 0',
  },
  submitRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    margin: '1rem 0',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.85rem',
  },
  success: {
    color: '#2e7d32',
    fontSize: '0.85rem',
  },
}
