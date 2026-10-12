// The architecture debugger. Every pane reads an existing public API; nothing
// here maintains its own copy of runtime state, and no API was added to Core
// or React to serve it.
//
// The one computed value is the projection: the runtime does not expose the
// projection it used, so this calls port.project(data) for the current data.
// It is labelled as exactly that rather than implying a hidden snapshot.
import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type {
  FormRuntime,
  SchemaEvaluationPort,
  SubmissionState,
  UIDocument,
  UIHints,
  UINode,
} from '@texaryn/core'
import { useStore } from '@texaryn/react'
import { InspectorTree } from './InspectorTree.js'

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
const PIPELINE = ['JSON Schema', 'SchemaProjection', 'UIDocument', 'Runtime state', 'Renderer']

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
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([])

  function moveTabFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = TABS.length - 1
    else return

    event.preventDefault()
    const nextTab = TABS[nextIndex]!
    setTab(nextTab)
    tabButtons.current[nextIndex]?.focus()
  }

  return (
    <div className="pg-inspector">
      <div
        className="pg-inspector__pipeline"
        aria-label="Schema processing pipeline"
        title="The stages each tab shows"
      >
        {PIPELINE.map((stage, index) => (
          <span className="pg-inspector__pipeline-step" key={stage}>
            {index > 0 && <span aria-hidden="true">→</span>}
            <span>{stage}</span>
          </span>
        ))}
      </div>

      <div role="tablist" aria-label="Inspector" aria-orientation="horizontal" className="pg-tabs">
        {TABS.map((name, index) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`inspector-tab-${name.toLowerCase()}`}
            aria-controls="inspector-panel"
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            ref={(element) => { tabButtons.current[index] = element }}
            onKeyDown={(event) => moveTabFocus(event, index)}
            onClick={() => setTab(name)}
            className="pg-tab"
          >
            {name}
          </button>
        ))}
      </div>

      <div
        id="inspector-panel"
        role="tabpanel"
        aria-labelledby={`inspector-tab-${tab.toLowerCase()}`}
        tabIndex={0}
        className="pg-inspector__body"
      >
        {tab === 'Data' && <InspectorTree label="Data" value={data} />}
        {tab === 'Validation' && <ValidationPane runtime={runtime} />}
        {tab === 'Projection' && <ProjectionPane port={port} data={data} />}
        {tab === 'IR' && <IrPane document={document} />}
        {tab === 'Runtime' && (
          <RuntimePane runtime={runtime} document={document} submission={submission} />
        )}
        {tab === 'Schema' && <pre className="pg-pre">{schemaText}</pre>}
        {tab === 'Hints' && (
          hints ? <InspectorTree label="Hints" value={hints} /> : <p className="pg-empty">No hints for this example.</p>
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
    return <p className="pg-empty">No visible errors.</p>
  }
  return <InspectorTree label="Validation errors" value={visibleErrors} />
}

function ProjectionPane({ port, data }: { port: SchemaEvaluationPort; data: unknown }) {
  const projection = port.project(data)
  const pointers = [...projection.nodes.keys()].map(String).sort()

  return (
    <>
      <p className="pg-note">
        The projection for the current data. Recomputed here for inspection, not read
        from the runtime.
      </p>
      <p className="pg-pointers">{pointers.length} pointers: {pointers.join(', ')}</p>
      <InspectorTree label="Projection" value={projection} />
    </>
  )
}

function IrPane({ document }: { document: UIDocument }) {
  const nodes = Object.values(document.nodes)
  return (
    <>
      <p className="pg-note">
        The UIDocument the renderer consumes. Each node carries the pointer it came
        from, so a field can be followed from schema semantics into the compiled node.
      </p>
      <table className="pg-table">
        <thead>
          <tr>
            <th>Node</th>
            <th>Type</th>
            <th>Pointer</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.id}>
              <td>{node.id}</td>
              <td>{node.type}</td>
              <td>{node.dataPointer ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <InspectorTree label="UIDocument" value={document} />
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
      <h3 className="pg-subheading">Submission</h3>
      <InspectorTree label="Submission" value={submission} />

      <h3 className="pg-subheading">Per-node state</h3>
      <table className="pg-table">
        <thead>
          <tr>
            <th>Pointer</th>
            <th>Dirty</th>
            <th>Touched</th>
            <th>Status</th>
            <th>Shows errors</th>
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
      <td>{pointer}</td>
      <td>{String(dirty)}</td>
      <td>{String(touched)}</td>
      <td>{status}</td>
      <td>{String(showErrors)}</td>
    </tr>
  )
}
