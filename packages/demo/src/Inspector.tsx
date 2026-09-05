// The architecture debugger. Every pane reads an existing public API; nothing
// here maintains its own copy of runtime state, and no API was added to Core
// or React to serve it.
//
// The one computed value is the projection: the runtime does not expose the
// projection it used, so this calls port.project(data) for the current data.
// It is labelled as exactly that rather than implying a hidden snapshot.
import type { CSSProperties } from 'react'
import type {
  FormRuntime,
  SchemaEvaluationPort,
  SubmissionState,
  UIDocument,
  UIHints,
  UINode,
} from '@texaryn/core'
import { useStore } from '@texaryn/react'
import { inspect } from './serialize.js'

const TABS = [
  'Data',
  'Validation',
  'Projection',
  'IR',
  'Runtime',
  'Schema',
  'Hints',
] as const

export type Tab = (typeof TABS)[number]
export const DEFAULT_TAB: Tab = 'Data'

// The pipeline the panes follow, shown so the tabs read as stages of one
// transformation rather than seven unrelated JSON dumps.
const PIPELINE = 'JSON Schema → SchemaProjection → UIDocument → Runtime state → Renderer'

// The selected tab is owned above this component. Editing the schema builds a
// new runtime and remounts the form, and losing the open pane on every
// keystroke would make the schema editor unusable alongside the inspector.
export function Inspector({
  runtime,
  port,
  data,
  submission,
  document,
  schemaText,
  hints,
  tab,
  onTabChange,
}: {
  runtime: FormRuntime
  port: SchemaEvaluationPort
  data: unknown
  submission: SubmissionState
  document: UIDocument
  schemaText: string
  hints: UIHints | undefined
  tab: Tab
  onTabChange: (tab: Tab) => void
}) {
  const setTab = onTabChange

  return (
    <div style={styles.panel}>
      <div style={styles.pipeline} title="The stages each tab shows">
        {PIPELINE}
      </div>

      <div role="tablist" aria-label="Inspector" style={styles.tabs}>
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            style={{ ...styles.tab, ...(tab === name ? styles.tabActive : null) }}
          >
            {name}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={tab} style={styles.body}>
        {tab === 'Data' && <pre style={styles.pre}>{inspect(data)}</pre>}
        {tab === 'Validation' && <ValidationPane runtime={runtime} />}
        {tab === 'Projection' && <ProjectionPane port={port} data={data} />}
        {tab === 'IR' && <IrPane document={document} />}
        {tab === 'Runtime' && (
          <RuntimePane runtime={runtime} document={document} submission={submission} />
        )}
        {tab === 'Schema' && <pre style={styles.pre}>{schemaText}</pre>}
        {tab === 'Hints' && (
          <pre style={styles.pre}>{hints ? inspect(hints) : 'No hints for this example.'}</pre>
        )}
      </div>
    </div>
  )
}

// visibleErrors is the runtime's own answer to "what should be shown right
// now", which is not the same as re-running validation and printing whatever
// comes back.
function ValidationPane({ runtime }: { runtime: FormRuntime }) {
  const visibleErrors = useStore(runtime.visibleErrors)

  if (visibleErrors.length === 0) {
    return <p style={styles.empty}>No visible errors.</p>
  }
  return <pre style={styles.pre}>{inspect(visibleErrors)}</pre>
}

function ProjectionPane({ port, data }: { port: SchemaEvaluationPort; data: unknown }) {
  const projection = port.project(data)
  const pointers = [...projection.nodes.keys()].map(String).sort()

  return (
    <>
      <p style={styles.note}>
        The projection for the current data. Recomputed here for inspection, not read
        from the runtime.
      </p>
      <p style={styles.pointers}>{pointers.length} pointers: {pointers.join(', ')}</p>
      <pre style={styles.pre}>{inspect(projection)}</pre>
    </>
  )
}

function IrPane({ document }: { document: UIDocument }) {
  const nodes = Object.values(document.nodes)
  return (
    <>
      <p style={styles.note}>
        The UIDocument the renderer consumes. Each node carries the pointer it came
        from, so a field can be followed from schema semantics into the compiled node.
      </p>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Node</th>
            <th style={styles.th}>Type</th>
            <th style={styles.th}>Pointer</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.id}>
              <td style={styles.td}>{node.id}</td>
              <td style={styles.td}>{node.type}</td>
              <td style={styles.td}>{node.dataPointer ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <pre style={styles.pre}>{inspect(document)}</pre>
    </>
  )
}

function RuntimePane({
  runtime,
  document,
  submission,
}: {
  runtime: FormRuntime
  document: UIDocument
  submission: SubmissionState
}) {
  const nodes = Object.values(document.nodes).filter((node) => node.dataPointer != null)

  return (
    <>
      <h3 style={styles.subheading}>Submission</h3>
      <pre style={styles.pre}>{inspect(submission)}</pre>

      <h3 style={styles.subheading}>Per-node state</h3>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Pointer</th>
            <th style={styles.th}>Dirty</th>
            <th style={styles.th}>Touched</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Shows errors</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <NodeStateRow key={node.id} runtime={runtime} node={node} />
          ))}
        </tbody>
      </table>
    </>
  )
}

// Every property of NodeState is its own Store, so reading a snapshot would
// render the right value once and then never update. Each row is a component
// so the stores can be subscribed through the existing useStore bridge.
function NodeStateRow({ runtime, node }: { runtime: FormRuntime; node: UINode }) {
  const state = runtime.getNodeState(node.id)
  if (!state) return null
  return <NodeStateRowInner pointer={node.dataPointer ?? '—'} state={state} />
}

function NodeStateRowInner({
  pointer,
  state,
}: {
  pointer: string
  state: NonNullable<ReturnType<FormRuntime['getNodeState']>>
}) {
  const dirty = useStore(state.dirty)
  const touched = useStore(state.touched)
  const status = useStore(state.validationStatus)
  const showErrors = useStore(state.showErrors)

  return (
    <tr>
      <td style={styles.td}>{pointer}</td>
      <td style={styles.td}>{String(dirty)}</td>
      <td style={styles.td}>{String(touched)}</td>
      <td style={styles.td}>{status}</td>
      <td style={styles.td}>{String(showErrors)}</td>
    </tr>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
  },
  pipeline: {
    fontSize: '0.7rem',
    color: '#666',
    marginBottom: '0.5rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  tabs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.25rem',
    marginBottom: '0.5rem',
  },
  tab: {
    padding: '0.25rem 0.5rem',
    fontSize: '0.8rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#ccc',
    borderRadius: '3px',
    background: '#fff',
    cursor: 'pointer',
  },
  tabActive: {
    background: '#e8f0fe',
    borderColor: '#a8c7fa',
    fontWeight: 600,
  },
  body: {
    overflow: 'auto',
    minHeight: 0,
    flex: '1 1 auto',
  },
  subheading: {
    fontSize: '0.8rem',
    margin: '0.75rem 0 0.25rem 0',
  },
  note: {
    fontSize: '0.75rem',
    color: '#666',
    margin: '0 0 0.5rem 0',
    lineHeight: 1.4,
  },
  pointers: {
    fontSize: '0.7rem',
    color: '#444',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    wordBreak: 'break-word',
    margin: '0 0 0.5rem 0',
  },
  empty: {
    fontSize: '0.85rem',
    color: '#666',
  },
  pre: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.75rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  },
  table: {
    borderCollapse: 'collapse',
    fontSize: '0.75rem',
    width: '100%',
    marginBottom: '0.75rem',
  },
  th: {
    textAlign: 'left',
    borderBottom: '1px solid #ddd',
    padding: '0.2rem 0.3rem',
    fontWeight: 600,
  },
  td: {
    borderBottom: '1px solid #f0f0f0',
    padding: '0.2rem 0.3rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
}
