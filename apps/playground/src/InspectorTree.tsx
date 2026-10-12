import { useState } from 'react'
import type { CSSProperties } from 'react'
import { inspect } from './serialize.js'

interface Entry {
  key: string
  value: unknown
}

function entriesFor(value: unknown): Entry[] | null {
  if (Array.isArray(value)) {
    return value.map((entry, index) => ({ key: `[${index}]`, value: entry }))
  }
  if (value instanceof Map) {
    return [...value.entries()].map(([key, entry], index) => ({
      key: `Map entry ${index} with key ${preview(key)}`,
      value: entry,
    }))
  }
  if (value instanceof Set) {
    return [...value].map((entry, index) => ({ key: `Set entry ${index}`, value: entry }))
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => ({ key, value: (value as Record<string, unknown>)[key] }))
  }
  return null
}

function preview(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return `Array(${value.length})`
  if (value instanceof Map) return `Map(${value.size})`
  if (value instanceof Set) return `Set(${value.size})`
  return `Object(${Object.keys(value as object).length})`
}

function TreeNode({
  name,
  value,
  depth,
  hideUnset,
}: {
  name: string
  value: unknown
  depth: number
  hideUnset: boolean
}) {
  const [isOpen, setIsOpen] = useState(depth === 0)
  const entries = entriesFor(value)
  const visibleEntries = entries?.filter((entry) => !(hideUnset && entry.value === undefined))

  if (!entries || entries.length === 0) {
    return (
      <div className="pg-tree__leaf" style={{ '--pg-tree-depth': depth } as CSSProperties}>
        <span className="pg-tree__key">{name}</span>
        <span className={`pg-tree__value pg-tree__value--${value === undefined ? 'undefined' : value === null ? 'null' : typeof value}`}>
          {preview(value)}
        </span>
      </div>
    )
  }

  return (
    <details
      className="pg-tree__node"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary style={{ '--pg-tree-depth': depth } as CSSProperties}>
        <span className="pg-tree__key">{name}</span>
        <span className="pg-tree__preview">{preview(value)}</span>
      </summary>
      {isOpen && (
        <div className="pg-tree__children">
          {visibleEntries?.length === 0 ? (
            <p className="pg-tree__empty">All values are unset.</p>
          ) : (
            visibleEntries?.map((entry) => (
              <TreeNode
                key={entry.key}
                name={entry.key}
                value={entry.value}
                depth={depth + 1}
                hideUnset={hideUnset}
              />
            ))
          )}
        </div>
      )}
    </details>
  )
}

export function InspectorTree({ label, value }: { label: string; value: unknown }) {
  const [hideUnset, setHideUnset] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const rawJson = inspect(value)

  async function copyRawJson() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable')
      await navigator.clipboard.writeText(rawJson)
      setCopyStatus('Copied')
    } catch {
      setCopyStatus('Select the text below to copy it')
    }
  }

  return (
    <div className="pg-tree-view">
      <div className="pg-tree-view__toolbar">
        <label className="pg-tree-view__toggle">
          <input
            type="checkbox"
            checked={hideUnset}
            onChange={(event) => setHideUnset(event.target.checked)}
          />
          Hide unset values
        </label>
        <button className="pg-tree-view__copy" type="button" onClick={copyRawJson}>
          Copy raw JSON
        </button>
        <span className="pg-sr-only" aria-live="polite">{copyStatus}</span>
      </div>
      <div className="pg-tree" role="group" aria-label={`${label} value tree`}>
        <TreeNode name={label} value={value} depth={0} hideUnset={hideUnset} />
      </div>
      <details className="pg-tree-view__raw">
        <summary>Raw diagnostic JSON</summary>
        <pre className="pg-pre">{rawJson}</pre>
      </details>
    </div>
  )
}
