import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SchemaEvaluationPort } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import {
  useForm,
  FormContext,
  FormRoot,
  ErrorSummary,
  createDefaultRegistry,
} from '@texaryn/react'
import { contactSchema, sampleSchemas } from './schemas.js'
import type { SampleEntry } from './schemas.js'

const registry = createDefaultRegistry()

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
}: {
  port: SchemaEvaluationPort
  entry: SampleEntry
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
        <h2 style={styles.heading}>Live Data</h2>
        <pre style={styles.pre}>{JSON.stringify(form.data, null, 2)}</pre>
        <h2 style={styles.heading}>Submission</h2>
        <pre style={styles.pre}>{JSON.stringify(form.submission, null, 2)}</pre>
      </div>
    </>
  )
}

const CUSTOM_KEY = 'custom'

const customEntry: SampleEntry = { label: 'Custom schema', schema: {} }

export function App() {
  const [selectedKey, setSelectedKey] = useState('contact')
  const [schemaText, setSchemaText] = useState(() => formatSchema(contactSchema))
  const [parseError, setParseError] = useState<string | null>(null)

  const handleSchemaChange = useCallback((text: string) => {
    setSelectedKey(CUSTOM_KEY)
    setSchemaText(text)
    try {
      JSON.parse(text)
      setParseError(null)
    } catch (err) {
      setParseError(errorMessage(err))
    }
  }, [])

  const handleSelectChange = useCallback((key: string) => {
    setSelectedKey(key)
    const entry = sampleSchemas[key]
    if (entry) {
      setSchemaText(formatSchema(entry.schema))
      setParseError(null)
    }
  }, [])

  const adapterState = useAdapter(schemaText, parseError)
  const entry = sampleSchemas[selectedKey] ?? customEntry

  return (
    <div style={styles.app}>
      <div style={styles.leftPanel}>
        <h1 style={styles.title}>Texaryn Demo</h1>

        <label style={styles.label} htmlFor="schema-select">
          Sample schema
        </label>
        <select
          id="schema-select"
          value={selectedKey}
          onChange={(e) => handleSelectChange(e.target.value)}
          style={styles.select}
        >
          {Object.entries(sampleSchemas).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
          <option value={CUSTOM_KEY}>{customEntry.label}</option>
        </select>

        <h2 style={styles.heading}>JSON Schema</h2>
        <textarea
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
          key={`${selectedKey}:${adapterState.id}`}
          port={adapterState.port}
          entry={entry}
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
